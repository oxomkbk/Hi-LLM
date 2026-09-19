import 'server-only'

import { randomUUID } from 'node:crypto'

import { ensureBusinessUser, withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'
import { AiSecurityError } from './errors'
import { invalidateSecurityState } from './invalidation'
import {
  assessmentIdempotencyKey,
  isReusableAssessment,
  nextRetryAttempt,
  normalizeClaimLimit,
  normalizeClaimScope,
  remainingGlobalWorkerCapacity,
  usesLlmBudget,
} from './queue-policy'
import { securityModeForSubject } from './settings'
import { loadSecuritySubjectSnapshot, lockSecuritySubjectRow } from './subject-repository'

import type {
  SecurityAssessmentStatus,
  SecurityExecutionProfile,
  SecurityMode,
  SecurityPublicSubjectType,
  SecuritySubjectType,
  SecurityTrigger,
} from './domain'
import type { AssessmentClaimScope, LeaseIdentity } from './queue-policy'
import type { Actor } from '@/lib/repositories/catalog'
import type { PoolClient } from 'pg'

export interface AssessmentQueueRow {
  attempt_number: number
  batch_id: string | null
  cancel_requested_at: Date | null
  created_at: Date
  declared_fingerprint: string
  execution_profile: SecurityExecutionProfile
  id: string
  input_fingerprint: string | null
  lease_expires_at: Date | null
  lease_token: string | null
  lease_version: number | string
  retry_root_id: string
  scanner_config_fingerprint: string
  status: SecurityAssessmentStatus
  subject_id: string
  subject_name_snapshot: string
  subject_slug_snapshot: string | null
  subject_type: SecuritySubjectType
  worker_id: string | null
}

export interface CreateAssessmentJobInput {
  actor: Actor
  force?: boolean
  requestId?: string | null
  subjectId: string
  subjectType: SecuritySubjectType
  trigger: Exclude<SecurityTrigger, 'retry'>
}

export interface CreateBatchAssessmentJobInput {
  batchId: string
  subjectId: string
  subjectType: SecuritySubjectType
}

export interface CreateSystemAssessmentJobInput {
  subjectId: string
  subjectType: SecuritySubjectType
}

interface QueueSettingsRow {
  max_attempts: number
  max_queue_size: number
  mcp_mode: SecurityMode
  prompt_mode: SecurityMode
  required_scanner_config_fingerprints: Record<string, string>
  service_enabled: boolean
  service_state_version: string
  skill_mode: SecurityMode
}

interface SubjectStateRow {
  active_assessment_id: string | null
  assessed_declared_fingerprint: string | null
  current_declared_fingerprint: string
  fresh_until: Date | null
  ignored_at: Date | null
  latest_assessment_id: string | null
  report_state: 'blocked' | 'failed' | 'passed' | 'review_required' | 'stale' | 'unassessed'
  scanner_config_fingerprint: string | null
}

export class AssessmentQueueError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function cancelAssessmentJob(assessmentId: string, actor: Actor) {
  return withBusinessTransaction(async (client) => {
    await ensureBusinessUser(actor, client)
    const result = await client.query<AssessmentQueueRow>(`
      select ${queueColumns()}
      from public.ds_ai_security_assessments
      where id = $1::uuid
      for update
    `, [assessmentId])
    const assessment = result.rows[0]
    if (!assessment)
      throw queueError('评测任务不存在', 404, 'SECURITY_ASSESSMENT_NOT_FOUND')

    if (assessment.status === 'queued') {
      await client.query(`
        update public.ds_ai_security_assessments
        set status = 'cancelled', cancel_requested_at = now(),
            cancel_requested_by = $2::uuid, finished_at = now()
        where id = $1::uuid and status = 'queued'
      `, [assessmentId, actor.id])
      await clearActiveAssessment(client, assessment, 'cancelled')
      await writeQueueAudit(client, actor.id, assessment, 'security.assessment.cancelled', 'SECURITY_ASSESSMENT_CANCELLED')
      return { status: 'cancelled' as const }
    }

    if (assessment.status === 'preparing' || assessment.status === 'running') {
      await client.query(`
        update public.ds_ai_security_assessments
        set cancel_requested_at = coalesce(cancel_requested_at, now()),
            cancel_requested_by = coalesce(cancel_requested_by, $2::uuid)
        where id = $1::uuid and status in ('preparing', 'running')
      `, [assessmentId, actor.id])
      await writeQueueAudit(client, actor.id, assessment, 'security.assessment.cancel_requested', 'SECURITY_ASSESSMENT_CANCEL_REQUESTED')
      return { status: 'cancel_requested' as const }
    }

    return { status: assessment.status }
  })
}

export async function claimAssessmentJobs(
  workerId: string,
  observedServiceStateVersion: number,
  requestedLimit = 1,
  leaseSeconds = 60,
  allowedPublicSubjectTypes?: readonly SecurityPublicSubjectType[],
  claimScope: AssessmentClaimScope = { executionProfile: 'configured' },
) {
  const normalizedWorkerId = normalizeWorkerId(workerId)
  if (!Number.isSafeInteger(observedServiceStateVersion) || observedServiceStateVersion < 1)
    throw new TypeError('Invalid observed security service state version')
  const limit = normalizeClaimLimit(requestedLimit)
  const duration = Math.max(30, Math.min(300, Math.trunc(leaseSeconds)))
  const normalizedScope = normalizeClaimScope(claimScope)

  return withBusinessTransaction(async (client) => {
    const settings = await client.query<{
      daily_llm_budget: number
      mcp_mode: SecurityMode
      prompt_mode: SecurityMode
      service_enabled: boolean
      service_state_version: string
      skill_mode: SecurityMode
      worker_concurrency: number
    }>(`
      select daily_llm_budget, skill_mode, mcp_mode, prompt_mode,
             service_enabled, service_state_version, worker_concurrency
      from public.ds_ai_security_settings
      where id = true
      for update
    `)
    const currentSettings = settings.rows[0]
    if (!currentSettings)
      throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security settings row is missing')
    if (!currentSettings.service_enabled)
      return []
    if (Number(currentSettings.service_state_version) !== observedServiceStateVersion) {
      throw queueError(
        '评测服务状态已变化，Worker 必须重新检查运行条件',
        409,
        'SECURITY_SERVICE_STATE_CONFLICT',
      )
    }
    const enabledSubjectTypes = activeSubjectTypes(currentSettings, allowedPublicSubjectTypes)
    if (enabledSubjectTypes.length === 0)
      return []
    const usage = usesLlmBudget(normalizedScope.executionProfile)
      ? await client.query<{ count: string }>(`
          select count(*)::text as count
          from public.ds_ai_security_assessments
          where execution_profile = 'configured'
            and started_at >= date_trunc('day', now())
        `)
      : null
    const remainingBudget = usage
      ? Math.max(0, currentSettings.daily_llm_budget - Number(usage.rows[0]?.count ?? 0))
      : limit
    if (remainingBudget === 0)
      return []
    const inFlight = await client.query<{ count: string }>(`
      select count(*)::text as count
      from public.ds_ai_security_assessments
      where status in ('preparing', 'running')
    `)
    const remainingCapacity = remainingGlobalWorkerCapacity(
      Number(currentSettings.worker_concurrency),
      Number(inFlight.rows[0]?.count ?? 0),
    )
    if (remainingCapacity === 0)
      return []
    const claimLimit = Math.min(limit, remainingBudget, remainingCapacity)
    const claimed = await client.query<AssessmentQueueRow>(`
      with candidates as (
        select id
        from public.ds_ai_security_assessments
        where status = 'queued' and next_run_at <= now()
          and subject_type = any($4::text[])
          and execution_profile = $5
          and (
            ($5 = 'configured' and batch_id is null)
            or ($5 = 'local_deterministic' and batch_id = any($6::uuid[]))
          )
          and not exists (
            select 1 from public.ds_ai_security_subject_states state
            where state.subject_type = ds_ai_security_assessments.subject_type
              and state.subject_id = ds_ai_security_assessments.subject_id
              and state.ignored_at is not null
          )
        order by next_run_at, created_at, id
        for update skip locked
        limit $1
      )
      update public.ds_ai_security_assessments assessment
      set status = 'preparing',
          worker_id = $2,
          lease_token = gen_random_uuid(),
          lease_version = assessment.lease_version + 1,
          lease_expires_at = now() + make_interval(secs => $3),
          heartbeat_at = now(),
          started_at = coalesce(assessment.started_at, now())
      from candidates
      where assessment.id = candidates.id
      returning ${queueColumns('assessment')}
    `, [
      claimLimit,
      normalizedWorkerId,
      duration,
      enabledSubjectTypes,
      normalizedScope.executionProfile,
      normalizedScope.batchIds,
    ])
    return claimed.rows.map(projectQueueRow)
  })
}

export async function createAssessmentJob(input: CreateAssessmentJobInput) {
  return enqueueAssessmentJob({
    ...input,
    batchId: null,
    executionProfile: 'configured',
  })
}

export async function createBatchAssessmentJob(input: CreateBatchAssessmentJobInput) {
  const scope = normalizeClaimScope({
    batchIds: [input.batchId],
    executionProfile: 'local_deterministic',
  })
  return enqueueAssessmentJob({
    actor: null,
    batchId: scope.batchIds![0]!,
    executionProfile: 'local_deterministic',
    force: false,
    requestId: null,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    trigger: 'batch',
  })
}

export async function createSystemAssessmentJob(input: CreateSystemAssessmentJobInput) {
  return enqueueAssessmentJob({
    actor: null,
    batchId: null,
    executionProfile: 'configured',
    force: false,
    requestId: null,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    trigger: 'publish_gate',
  })
}

export async function heartbeatAssessmentLease(assessmentId: string, lease: LeaseIdentity, leaseSeconds = 60) {
  const duration = Math.max(30, Math.min(300, Math.trunc(leaseSeconds)))
  const result = await withBusinessTransaction(client => client.query<AssessmentQueueRow>(`
    update public.ds_ai_security_assessments
    set heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => $5)
    where id = $1::uuid and status in ('preparing', 'running')
      and worker_id = $2 and lease_token = $3::uuid and lease_version = $4
      and lease_expires_at > now()
    returning ${queueColumns()}
  `, [assessmentId, normalizeWorkerId(lease.workerId), lease.leaseToken, lease.leaseVersion, duration]))
  const row = result.rows[0]
  if (!row)
    throw queueError('评测任务租约已失效', 409, 'SECURITY_LEASE_LOST')
  return projectQueueRow(row)
}

export async function isAssessmentCancellationRequested(assessmentId: string, lease: LeaseIdentity) {
  return withBusinessTransaction(async (client) => {
    const result = await client.query<{ cancel_requested_at: Date | null }>(`
      select cancel_requested_at
      from public.ds_ai_security_assessments
      where id = $1::uuid and status in ('preparing', 'running')
        and worker_id = $2 and lease_token = $3::uuid and lease_version = $4
        and lease_expires_at > now()
    `, [assessmentId, normalizeWorkerId(lease.workerId), lease.leaseToken, lease.leaseVersion])
    if (!result.rows[0])
      throw queueError('评测任务租约已失效', 409, 'SECURITY_LEASE_LOST')
    return result.rows[0].cancel_requested_at !== null
  })
}

export async function markAssessmentRunning(assessmentId: string, lease: LeaseIdentity) {
  const result = await withBusinessTransaction(client => client.query<AssessmentQueueRow>(`
    update public.ds_ai_security_assessments
    set status = 'running', heartbeat_at = now()
    where id = $1::uuid and status = 'preparing'
      and worker_id = $2 and lease_token = $3::uuid and lease_version = $4
      and lease_expires_at > now() and cancel_requested_at is null
    returning ${queueColumns()}
  `, [assessmentId, normalizeWorkerId(lease.workerId), lease.leaseToken, lease.leaseVersion]))
  const row = result.rows[0]
  if (!row)
    throw queueError('评测任务无法进入运行状态', 409, 'SECURITY_LEASE_LOST')
  return projectQueueRow(row)
}

export async function retryAssessmentJob(assessmentId: string, actor: Actor) {
  return withBusinessTransaction(async (client) => {
    await ensureBusinessUser(actor, client)
    const settings = await readQueueSettings(client, 'share')
    requireServiceEnabled(settings)
    const currentResult = await client.query<AssessmentQueueRow>(`
      select ${queueColumns()}
      from public.ds_ai_security_assessments
      where id = $1::uuid
      for update
    `, [assessmentId])
    const current = currentResult.rows[0]
    if (!current)
      throw queueError('评测任务不存在', 404, 'SECURITY_ASSESSMENT_NOT_FOUND')
    if (current.status !== 'failed' && current.status !== 'cancelled')
      throw queueError('只有失败或已取消的任务可以重试', 409, 'SECURITY_INVALID_STATE_TRANSITION')

    const attempt = nextRetryAttempt(current.attempt_number, settings.max_attempts)
    if (!attempt)
      throw queueError('该任务已达到最大重试次数', 409, 'SECURITY_ASSESSMENT_RETRY_EXHAUSTED')
    const state = await lockSubjectState(client, current.subject_type, current.subject_id)
    if (state.ignored_at)
      throw queueError('该内容已被管理员忽略，请先恢复后再重试', 409, 'SECURITY_SUBJECT_IGNORED')
    if (state.active_assessment_id) {
      const active = await findAssessment(client, state.active_assessment_id)
      if (active)
        return { assessment: projectQueueRow(active), kind: 'active' as const }
    }
    const requiredConfig = requiredConfigFingerprint(settings, current.subject_type)
    if (state.current_declared_fingerprint !== current.declared_fingerprint) {
      throw queueError('内容已经变化，请创建新的评测任务', 409, 'SECURITY_INVALID_FINGERPRINT')
    }
    if (requiredConfig !== current.scanner_config_fingerprint)
      throw queueError('扫描配置已经变化，请创建新的评测任务', 409, 'SECURITY_INVALID_FINGERPRINT')

    const retryId = randomUUID()
    const idempotencyKey = assessmentIdempotencyKey({
      batchId: current.batch_id,
      declaredFingerprint: current.declared_fingerprint,
      executionProfile: current.execution_profile,
      requestId: `${current.retry_root_id}:${attempt}`,
      scannerConfigFingerprint: current.scanner_config_fingerprint,
      subjectId: current.subject_id,
      subjectType: current.subject_type,
      trigger: 'retry',
    })
    const retry = await client.query<AssessmentQueueRow>(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
        trigger, declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_of_id, retry_root_id, attempt_number, created_by,
        execution_profile, batch_id
      ) values (
        $1::uuid, $2, $3::uuid, $4, $5, 'retry', $6, $7, $8,
        $9::uuid, $10::uuid, $11, $12::uuid, $13, $14::uuid
      )
      returning ${queueColumns()}
    `, [
      retryId,
      current.subject_type,
      current.subject_id,
      current.subject_name_snapshot,
      current.subject_slug_snapshot,
      current.declared_fingerprint,
      current.scanner_config_fingerprint,
      idempotencyKey,
      current.id,
      current.retry_root_id,
      attempt,
      actor.id,
      current.execution_profile,
      current.batch_id,
    ])
    await client.query(`
      update public.ds_ai_security_subject_states
      set active_assessment_id = $3::uuid, latest_attempt_id = $3::uuid,
          row_version = row_version + 1
      where subject_type = $1 and subject_id = $2::uuid
    `, [current.subject_type, current.subject_id, retryId])
    await writeQueueAudit(client, actor.id, retry.rows[0]!, 'security.assessment.retried', 'SECURITY_ASSESSMENT_RETRIED')
    return { assessment: projectQueueRow(retry.rows[0]!), kind: 'queued' as const }
  })
}

function activeSubjectTypes(
  settings: Pick<QueueSettingsRow, 'mcp_mode' | 'prompt_mode' | 'skill_mode'>,
  allowedPublicSubjectTypes?: readonly SecurityPublicSubjectType[],
) {
  const allowed = allowedPublicSubjectTypes ? new Set(allowedPublicSubjectTypes) : null
  const subjectTypes: SecuritySubjectType[] = []
  if (settings.skill_mode !== 'off' && (!allowed || allowed.has('skill')))
    subjectTypes.push('skill', 'skill_submission')
  if (settings.mcp_mode !== 'off' && (!allowed || allowed.has('mcp')))
    subjectTypes.push('mcp', 'mcp_submission')
  if (settings.prompt_mode !== 'off' && (!allowed || allowed.has('prompt')))
    subjectTypes.push('prompt')
  return subjectTypes
}

async function clearActiveAssessment(
  client: PoolClient,
  assessment: AssessmentQueueRow,
  terminalStatus: 'cancelled' | 'failed',
) {
  await client.query(`
    update public.ds_ai_security_subject_states
    set active_assessment_id = case when active_assessment_id = $3::uuid then null else active_assessment_id end,
        latest_attempt_id = $3::uuid,
        report_state = case
          when latest_assessment_id is null and $4 = 'failed' then 'failed'
          when latest_assessment_id is null then 'unassessed'
          else report_state
        end,
        row_version = row_version + 1
    where subject_type = $1 and subject_id = $2::uuid
  `, [assessment.subject_type, assessment.subject_id, assessment.id, terminalStatus])
}

async function enqueueAssessmentJob(
  input: Omit<CreateAssessmentJobInput, 'actor'> & {
    actor: Actor | null
    batchId: string | null
    executionProfile: SecurityExecutionProfile
  },
) {
  return withBusinessTransaction(async (client) => {
    if (input.force && !input.requestId?.normalize('NFC').trim())
      throw queueError('强制重新扫描必须提供请求标识', 400, 'SECURITY_REPORT_INVALID')
    if (input.actor)
      await ensureBusinessUser(input.actor, client)
    const settings = await readQueueSettings(client, 'share')
    requireServiceEnabled(settings)
    await lockSecuritySubjectRow(client, input.subjectType, input.subjectId)
    const mode = securityModeForSubject({
      mcpMode: settings.mcp_mode,
      promptMode: settings.prompt_mode,
      skillMode: settings.skill_mode,
    }, input.subjectType)
    if (mode === 'off')
      throw queueError('该内容类型的安全评测尚未启用', 409, 'SECURITY_MODE_DISABLED')

    const configFingerprint = requiredConfigFingerprint(settings, input.subjectType)
    const snapshot = await loadSecuritySubjectSnapshot(client, input.subjectType, input.subjectId)
    await invalidateSecurityState(client, {
      id: input.subjectId,
      type: input.subjectType,
    }, snapshot.declaredFingerprint)
    const state = await lockSubjectState(client, input.subjectType, input.subjectId)
    if (state.ignored_at)
      throw queueError('该内容已被管理员忽略，请先恢复后再评测', 409, 'SECURITY_SUBJECT_IGNORED')

    if (state.active_assessment_id) {
      const active = await findAssessment(client, state.active_assessment_id)
      if (active)
        return { assessment: projectQueueRow(active), kind: 'active' as const }
    }

    if (!input.force && state.latest_assessment_id) {
      const binding = await client.query<{ exists: boolean }>(`
        select exists (
          select 1 from public.ds_ai_security_assessment_bindings
          where assessment_id = $1::uuid and subject_type = $2 and subject_id = $3::uuid
            and bound_declared_fingerprint = $4
        ) as exists
      `, [state.latest_assessment_id, input.subjectType, input.subjectId, snapshot.declaredFingerprint])
      if (isReusableAssessment({
        assessedDeclaredFingerprint: state.assessed_declared_fingerprint,
        bindingMatches: binding.rows[0]?.exists === true,
        currentDeclaredFingerprint: snapshot.declaredFingerprint,
        currentScannerConfigFingerprint: configFingerprint,
        freshUntil: state.fresh_until,
        reportState: state.report_state,
        scannerConfigFingerprint: state.scanner_config_fingerprint,
      })) {
        const current = await findAssessment(client, state.latest_assessment_id)
        if (current?.execution_profile === input.executionProfile)
          return { assessment: projectQueueRow(current), kind: 'reused' as const }
      }
    }

    const queuedCount = await client.query<{ count: string }>(`
      select count(*)::text as count
      from public.ds_ai_security_assessments
      where status in ('queued', 'preparing', 'running')
    `)
    if (Number(queuedCount.rows[0]?.count ?? 0) >= settings.max_queue_size)
      throw queueError('安全评测队列已满，请稍后重试', 429, 'SECURITY_QUEUE_FULL')

    const idempotencyKey = assessmentIdempotencyKey({
      batchId: input.batchId,
      declaredFingerprint: snapshot.declaredFingerprint,
      executionProfile: input.executionProfile,
      requestId: input.requestId,
      scannerConfigFingerprint: configFingerprint,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      trigger: input.trigger,
    })
    const existing = await client.query<AssessmentQueueRow>(`
      select ${queueColumns()}
      from public.ds_ai_security_assessments
      where idempotency_key = $1
      limit 1
    `, [idempotencyKey])
    if (existing.rows[0])
      return { assessment: projectQueueRow(existing.rows[0]), kind: 'existing' as const }

    const assessmentId = randomUUID()
    const created = await client.query<AssessmentQueueRow>(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
        trigger, declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_root_id, attempt_number, created_by, execution_profile, batch_id
      ) values (
        $1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9,
        $1::uuid, 1, $10::uuid, $11, $12::uuid
      )
      returning ${queueColumns()}
    `, [
      assessmentId,
      input.subjectType,
      input.subjectId,
      snapshot.name,
      snapshot.slug,
      input.trigger,
      snapshot.declaredFingerprint,
      configFingerprint,
      idempotencyKey,
      input.actor?.id ?? null,
      input.executionProfile,
      input.batchId,
    ])
    await client.query(`
      update public.ds_ai_security_subject_states
      set active_assessment_id = $3::uuid,
          latest_attempt_id = $3::uuid,
          row_version = row_version + 1
      where subject_type = $1 and subject_id = $2::uuid
    `, [input.subjectType, input.subjectId, assessmentId])
    await writeQueueAudit(
      client,
      input.actor?.id ?? null,
      created.rows[0]!,
      'security.assessment.queued',
      'SECURITY_ASSESSMENT_QUEUED',
    )
    return { assessment: projectQueueRow(created.rows[0]!), kind: 'queued' as const }
  })
}

async function findAssessment(client: PoolClient, assessmentId: string) {
  const result = await client.query<AssessmentQueueRow>(`
    select ${queueColumns()}
    from public.ds_ai_security_assessments
    where id = $1::uuid
    limit 1
  `, [assessmentId])
  return result.rows[0] ?? null
}

async function lockSubjectState(client: PoolClient, subjectType: SecuritySubjectType, subjectId: string) {
  const result = await client.query<SubjectStateRow>(`
    select active_assessment_id, assessed_declared_fingerprint, current_declared_fingerprint, fresh_until,
           ignored_at, latest_assessment_id, report_state, scanner_config_fingerprint
    from public.ds_ai_security_subject_states
    where subject_type = $1 and subject_id = $2::uuid
    for update
  `, [subjectType, subjectId])
  const state = result.rows[0]
  if (!state)
    throw queueError('评测主体状态不存在', 503, 'SECURITY_SCHEMA_NOT_READY')
  return state
}

function normalizeWorkerId(workerId: string) {
  const normalized = workerId.normalize('NFC').trim()
  if (!normalized || normalized.length > 180)
    throw new TypeError('Invalid security worker ID')
  return normalized
}

function projectQueueRow(row: AssessmentQueueRow) {
  return {
    ...row,
    attempt_number: Number(row.attempt_number),
    lease_version: Number(row.lease_version),
  }
}

function publicSubjectType(subjectType: SecuritySubjectType) {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return 'skill'
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return 'mcp'
  return 'prompt'
}

function queueColumns(alias?: string) {
  const prefix = alias ? `${alias}.` : ''
  return [
    'id',
    'subject_type',
    'subject_id',
    'subject_name_snapshot',
    'subject_slug_snapshot',
    'status',
    'execution_profile',
    'batch_id',
    'declared_fingerprint',
    'input_fingerprint',
    'scanner_config_fingerprint',
    'worker_id',
    'lease_token',
    'lease_version',
    'lease_expires_at',
    'retry_root_id',
    'attempt_number',
    'cancel_requested_at',
    'created_at',
  ].map(column => `${prefix}${column}`).join(', ')
}

function queueError(message: string, status: number, code: string) {
  return new AssessmentQueueError(message, status, code)
}

async function readQueueSettings(client: PoolClient, lock: 'share' | 'update' | false = false) {
  const result = await client.query<QueueSettingsRow>(`
    select skill_mode, mcp_mode, prompt_mode, max_attempts, max_queue_size,
           required_scanner_config_fingerprints, service_enabled, service_state_version
    from public.ds_ai_security_settings
    where id = true
    ${lock === 'share' ? 'for share' : lock === 'update' ? 'for update' : ''}
  `)
  const settings = result.rows[0]
  if (!settings)
    throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security settings row is missing')
  return settings
}

function requiredConfigFingerprint(settings: QueueSettingsRow, subjectType: SecuritySubjectType) {
  const fingerprint = settings.required_scanner_config_fingerprints[publicSubjectType(subjectType)]
  if (!fingerprint || !/^[0-9a-f]{64}$/.test(fingerprint))
    throw queueError('该内容类型的扫描配置尚未确认', 503, 'SECURITY_SCHEMA_NOT_READY')
  return fingerprint
}

function requireServiceEnabled(settings: QueueSettingsRow) {
  if (!settings.service_enabled) {
    throw queueError(
      '评测服务已暂停，请先在安全评测中心开启',
      409,
      'SECURITY_SERVICE_DISABLED',
    )
  }
}

async function writeQueueAudit(
  client: PoolClient,
  actorUserId: string | null,
  assessment: AssessmentQueueRow,
  action: string,
  code: string,
) {
  await enqueueSecurityAudit(client, {
    action,
    actorUserId,
    code,
    metadata: {
      attemptNumber: Number(assessment.attempt_number),
      batchId: assessment.batch_id,
      executionProfile: assessment.execution_profile,
      subjectId: assessment.subject_id,
      subjectType: assessment.subject_type,
    },
    resourceId: assessment.id,
    resourceType: 'security_assessment',
    success: true,
  })
}

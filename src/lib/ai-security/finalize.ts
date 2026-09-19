import 'server-only'

import { randomUUID } from 'node:crypto'

import { withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'
import { normalizeCoverage } from './coverage'
import { AiSecurityError } from './errors'
import {
  freshUntilForSubject,
  reportPromotionEligibility,
  terminalReportDisposition,
} from './finalize-policy'
import { assessmentIdempotencyKey, leaseMatches, nextRetryAttempt } from './queue-policy'
import { scoreFindings } from './scoring'
import { loadSecuritySubjectSnapshot, lockSecuritySubjectRow } from './subject-repository'
import {
  calculateTrustScore,
  trustRatingForScore,
  trustRoundScore,
  trustSafetyScore,
} from './trust-policy'

import type { SecurityCoverageInput } from './coverage'
import type {
  SecurityAssessmentStatus,
  SecurityCoverage,
  SecurityCoverageLevel,
  SecuritySeverity,
  SecuritySubjectType,
  SecurityTrustDimension,
  SecurityTrustEvaluation,
} from './domain'
import type { LeaseIdentity } from './queue-policy'
import type { PoolClient } from 'pg'

export interface FinalizeAssessmentSuccessInput {
  assessmentId: string
  coverage: SecurityCoverageInput
  engineScore?: number | null
  evaluation: SecurityTrustEvaluation
  findings: readonly NormalizedSecurityFinding[]
  inputFingerprint: string
  lease: LeaseIdentity
  rawReportFileId?: string | null
  rulesVersion: string
  scannerName: string
  scannerVersion: string
  sourceRevision?: string | null
  summary?: string | null
}

export interface FinalizeAssessmentTerminalInput {
  assessmentId: string
  errorCode: string
  errorMessage: string
  lease: LeaseIdentity
  scheduleRetry?: boolean
  status: 'cancelled' | 'failed'
}

export interface NormalizedSecurityFinding {
  artifactPath?: string | null
  description: string
  endLine?: number | null
  evidenceRedacted?: string | null
  fingerprint: string
  publicSummary?: string | null
  publicVisible?: boolean
  recommendation?: string | null
  riskCode: string
  severity: SecuritySeverity
  startLine?: number | null
  title: string
}

interface FinalizableAssessmentRow {
  attempt_number: number
  batch_id: string | null
  cancel_requested_at: Date | null
  created_by: string | null
  declared_fingerprint: string
  execution_profile: 'configured' | 'local_deterministic'
  id: string
  lease_expires_at: Date | null
  lease_token: string | null
  lease_version: string
  retry_root_id: string
  scanner_config_fingerprint: string
  status: SecurityAssessmentStatus
  subject_id: string
  subject_name_snapshot: string
  subject_slug_snapshot: string | null
  subject_type: SecuritySubjectType
  worker_id: string | null
}

interface FinalizeSettingsRow {
  max_attempts: number
  required_scanner_config_fingerprints: Record<string, string>
}

interface FinalizeSubjectStateRow {
  active_assessment_id: string | null
  assessed_declared_fingerprint: string | null
  current_declared_fingerprint: string
  fresh_until: Date | null
  latest_assessment_id: string | null
  report_state: string
  scanner_config_fingerprint: string | null
}

export class AssessmentFinalizationError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function finalizeAssessmentSuccess(input: FinalizeAssessmentSuccessInput) {
  const coverage = normalizeCoverage(input.coverage)
  const findings = input.findings.map(normalizeFinding)
  const score = scoreFindings(findings.map(finding => ({
    fingerprint: finding.findingFingerprint,
    riskCode: finding.riskCode,
    severity: finding.severity,
  })))
  const evaluation = normalizeTrustEvaluation(input.evaluation, findings, coverage.level)
  validateFingerprint(input.inputFingerprint)
  validateEngineScore(input.engineScore)

  return withBusinessTransaction(async (client) => {
    const assessment = await lockAssessment(client, input.assessmentId)
    if (assessment.status !== 'running')
      throw finalizationError('评测任务不处于运行状态', 'SECURITY_INVALID_STATE_TRANSITION')
    const state = await lockSubjectState(client, assessment.subject_type, assessment.subject_id)
    await lockSecuritySubjectRow(client, assessment.subject_type, assessment.subject_id)
    const settings = await lockFinalizeSettings(client)
    const currentSnapshot = await loadSecuritySubjectSnapshot(client, assessment.subject_type, assessment.subject_id)
    const currentConfig = requiredConfigFingerprint(settings, assessment.subject_type)
    const eligibility = reportPromotionEligibility({
      activeAssessmentId: state.active_assessment_id,
      assessmentId: assessment.id,
      currentDeclaredFingerprint: currentSnapshot.declaredFingerprint,
      currentScannerConfigFingerprint: currentConfig,
      lease: {
        actual: assessmentLease(assessment),
        expected: input.lease,
      },
      taskDeclaredFingerprint: assessment.declared_fingerprint,
      taskScannerConfigFingerprint: assessment.scanner_config_fingerprint,
    })
    if (eligibility.reason === 'lease_lost')
      throw finalizationError('评测任务租约已经失效', 'SECURITY_LEASE_LOST')
    if (assessment.cancel_requested_at)
      throw finalizationError('评测任务已经请求取消', 'SECURITY_INVALID_STATE_TRANSITION')

    await saveCompletedAssessment(client, assessment, input, coverage, score, evaluation)
    await saveFindings(client, assessment.id, findings)
    await saveDimensionScores(client, assessment.id, evaluation)
    await client.query(`
      insert into public.ds_ai_security_assessment_bindings (
        assessment_id, subject_type, subject_id, binding_kind,
        bound_declared_fingerprint, bound_input_fingerprint
      ) values ($1::uuid, $2, $3::uuid, 'original', $4, $5)
      on conflict (assessment_id, subject_type, subject_id) do nothing
    `, [
      assessment.id,
      assessment.subject_type,
      assessment.subject_id,
      assessment.declared_fingerprint,
      input.inputFingerprint,
    ])

    const assessedAt = new Date()
    if (eligibility.eligible) {
      await promoteCompletedAssessment(client, assessment, input, score, assessedAt)
      if (score.verdict === 'passed')
        await publishRequestedContent(client, assessment.subject_type, assessment.subject_id)
    }
    else {
      await client.query(`
        update public.ds_ai_security_subject_states
        set latest_attempt_id = $3::uuid,
            active_assessment_id = case when active_assessment_id = $3::uuid then null else active_assessment_id end,
            row_version = row_version + 1
        where subject_type = $1 and subject_id = $2::uuid
      `, [assessment.subject_type, assessment.subject_id, assessment.id])
    }

    await enqueueSecurityAudit(client, {
      action: 'security.assessment.completed',
      actorUserId: null,
      code: eligibility.eligible ? 'SECURITY_ASSESSMENT_PROMOTED' : 'SECURITY_ASSESSMENT_HISTORICAL',
      metadata: {
        coverageLevel: coverage.level,
        promotionReason: eligibility.reason,
        qualityRating: evaluation.rating,
        qualityScore: evaluation.score,
        score: score.score,
        subjectId: assessment.subject_id,
        subjectType: assessment.subject_type,
        verdict: score.verdict,
      },
      resourceId: assessment.id,
      resourceType: 'security_assessment',
      success: true,
    })
    return {
      assessmentId: assessment.id,
      grade: score.grade,
      promoted: eligibility.eligible,
      promotionReason: eligibility.reason,
      qualityRating: evaluation.rating,
      qualityScore: evaluation.score,
      score: score.score,
      verdict: score.verdict,
    }
  })
}

export async function finalizeAssessmentTerminal(input: FinalizeAssessmentTerminalInput) {
  return withBusinessTransaction(async (client) => {
    const assessment = await lockAssessment(client, input.assessmentId)
    if (assessment.status !== 'preparing' && assessment.status !== 'running')
      throw finalizationError('评测任务不处于活动状态', 'SECURITY_INVALID_STATE_TRANSITION')
    if (!leaseMatches({ actual: assessmentLease(assessment), expected: input.lease }))
      throw finalizationError('评测任务租约已经失效', 'SECURITY_LEASE_LOST')
    return finalizeTerminalLocked(client, assessment, input)
  })
}

export function normalizeTrustEvaluation(
  value: unknown,
  findings: readonly Pick<NormalizedSecurityFinding, 'severity'>[] = [],
  coverageLevel: SecurityCoverageLevel = 'complete',
): SecurityTrustEvaluation {
  const requiredDimensions = ['safety', 'reliability', 'applicability', 'maintainability', 'effectiveness'] as const
  if (!isRecord(value) || !['deterministic', 'document_evidence', 'hybrid'].includes(String(value.method)))
    throw finalizationError('可信评测报告结构无效', 'SECURITY_REPORT_INVALID', 400)

  if (value.method === 'deterministic') {
    if (value.schemaVersion !== 'security-evidence-v1'
      || value.model !== 'platform-static-rules-v2'
      || value.rating !== null
      || value.score !== null
      || value.summary !== null
      || !Array.isArray(value.dimensions)
      || value.dimensions.length !== 0) {
      throw finalizationError('静态证据报告结构无效', 'SECURITY_REPORT_INVALID', 400)
    }
    return {
      dimensions: [],
      method: 'deterministic',
      model: 'platform-static-rules-v2',
      rating: null,
      schemaVersion: 'security-evidence-v1',
      score: null,
      summary: null,
    }
  }

  const documentEvidence = value.method === 'document_evidence'
  const expectedSchema = documentEvidence ? 'document-evidence-v1' : 'trusted-eval-v1'
  if (value.schemaVersion !== expectedSchema
    || typeof value.rating !== 'string'
    || !['exceptional', 'excellent', 'good', 'fair', 'poor'].includes(value.rating)
    || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 5
    || typeof value.model !== 'string'
    || typeof value.summary !== 'string'
    || !Array.isArray(value.dimensions) || value.dimensions.length !== requiredDimensions.length) {
    throw finalizationError('可信评测报告结构无效', 'SECURITY_REPORT_INVALID', 400)
  }
  if (documentEvidence && value.model !== 'platform-document-rubric-v1')
    throw finalizationError('材料评测模型身份无效', 'SECURITY_REPORT_INVALID', 400)
  const rawDimensions = value.dimensions
  const dimensions: SecurityTrustDimension[] = requiredDimensions.map((code) => {
    const candidate = rawDimensions.find(dimension => isRecord(dimension) && dimension.code === code)
    if (!isRecord(candidate)
      || typeof candidate.score !== 'number'
      || !Number.isFinite(candidate.score)
      || candidate.score < 0
      || candidate.score > 5
      || typeof candidate.summary !== 'string') {
      throw finalizationError(`可信评测维度无效：${code}`, 'SECURITY_REPORT_INVALID', 400)
    }
    const source = documentEvidence || code === 'safety' ? 'deterministic' as const : 'ai_assisted' as const
    if (candidate.source !== source)
      throw finalizationError(`可信评测维度来源无效：${code}`, 'SECURITY_REPORT_INVALID', 400)
    return {
      code,
      evidence: normalizeEvaluationList(candidate.evidence, 3, 300),
      recommendations: normalizeEvaluationList(candidate.recommendations, 3, 500),
      score: trustRoundScore(candidate.score),
      source,
      strengths: normalizeEvaluationList(candidate.strengths, 3, 500),
      summary: requiredText(candidate.summary, 2000),
      weaknesses: normalizeEvaluationList(candidate.weaknesses, 3, 500),
    }
  })
  const safety = dimensions[0]!
  if (safety.score !== trustSafetyScore(findings, coverageLevel))
    throw finalizationError('可信评测安全维度无效', 'SECURITY_REPORT_INVALID', 400)
  const score = calculateTrustScore(dimensions, findings)
  if (trustRoundScore(value.score) !== score)
    throw finalizationError('可信评测总分无效', 'SECURITY_REPORT_INVALID', 400)
  const rating = trustRatingForScore(score)
  if (value.rating !== rating)
    throw finalizationError('可信评测评级无效', 'SECURITY_REPORT_INVALID', 400)
  if (documentEvidence) {
    return {
      dimensions,
      method: 'document_evidence',
      model: 'platform-document-rubric-v1',
      rating,
      schemaVersion: 'document-evidence-v1',
      score,
      summary: requiredText(value.summary, 4000),
    }
  }
  return {
    dimensions,
    method: 'hybrid',
    model: requiredText(value.model, 200),
    rating,
    schemaVersion: 'trusted-eval-v1',
    score,
    summary: requiredText(value.summary, 4000),
  }
}

export async function reclaimExpiredAssessmentLeases(requestedLimit = 20) {
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
  return withBusinessTransaction(async (client) => {
    const expired = await client.query<FinalizableAssessmentRow>(`
      select id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
             status, execution_profile, batch_id, declared_fingerprint,
             scanner_config_fingerprint, worker_id,
             lease_token, lease_version, lease_expires_at, cancel_requested_at,
             retry_root_id, attempt_number, created_by
      from public.ds_ai_security_assessments
      where status in ('preparing', 'running')
        and lease_expires_at is not null and lease_expires_at <= now()
      order by lease_expires_at, id
      for update skip locked
      limit $1
    `, [limit])
    let retried = 0
    for (const assessment of expired.rows) {
      const cancelled = assessment.cancel_requested_at !== null
      const result = await finalizeTerminalLocked(client, assessment, {
        errorCode: cancelled ? 'SECURITY_ASSESSMENT_CANCELLED' : 'SECURITY_WORKER_TIMEOUT',
        errorMessage: cancelled ? '安全评测已按管理员请求取消' : '安全评测租约过期，任务已由维护进程回收',
        scheduleRetry: !cancelled,
        status: cancelled ? 'cancelled' : 'failed',
      })
      if (result.retryAssessmentId)
        retried += 1
    }
    return { reclaimed: expired.rowCount ?? expired.rows.length, retried }
  })
}

async function applyTerminalSubjectState(
  client: PoolClient,
  assessment: FinalizableAssessmentRow,
  disposition: ReturnType<typeof terminalReportDisposition>,
  retry: FinalizableAssessmentRow | null,
) {
  if (disposition === 'preserve') {
    await client.query(`
      update public.ds_ai_security_subject_states
      set latest_attempt_id = $3::uuid,
          active_assessment_id = $4::uuid,
          row_version = row_version + 1
      where subject_type = $1 and subject_id = $2::uuid
    `, [assessment.subject_type, assessment.subject_id, retry?.id ?? assessment.id, retry?.id ?? null])
    return
  }

  await client.query(`
    update public.ds_ai_security_subject_states
    set latest_attempt_id = $3::uuid,
        active_assessment_id = $4::uuid,
        report_state = $5,
        score = null, grade = null, verdict = null,
        stale_at = case when $5 = 'stale' then now() else stale_at end,
        row_version = row_version + 1
    where subject_type = $1 and subject_id = $2::uuid
  `, [assessment.subject_type, assessment.subject_id, retry?.id ?? assessment.id, retry?.id ?? null, disposition])
}

function assessmentLease(assessment: FinalizableAssessmentRow) {
  return {
    leaseExpiresAt: assessment.lease_expires_at,
    leaseToken: assessment.lease_token ?? '',
    leaseVersion: Number(assessment.lease_version),
    workerId: assessment.worker_id ?? '',
  }
}

function finalizationError(message: string, code: string, status = 409) {
  return new AssessmentFinalizationError(message, status, code)
}

async function finalizeTerminalLocked(
  client: PoolClient,
  assessment: FinalizableAssessmentRow,
  input: Omit<FinalizeAssessmentTerminalInput, 'assessmentId' | 'lease'>,
) {
  const state = await lockSubjectState(client, assessment.subject_type, assessment.subject_id)
  const settings = await lockFinalizeSettings(client)
  const currentConfig = requiredConfigFingerprint(settings, assessment.subject_type)
  const bindingMatches = state.latest_assessment_id
    ? await hasCurrentBinding(client, state.latest_assessment_id, assessment.subject_type, assessment.subject_id, state.current_declared_fingerprint)
    : false
  const oldReportCurrent = bindingMatches
    && ['passed', 'review_required', 'blocked'].includes(state.report_state)
    && state.assessed_declared_fingerprint === state.current_declared_fingerprint
    && state.scanner_config_fingerprint === currentConfig
    && (!state.fresh_until || state.fresh_until > new Date())
  const disposition = terminalReportDisposition({
    hasLatestAssessment: state.latest_assessment_id !== null,
    oldReportCurrent,
    terminalStatus: input.status,
  })

  await client.query(`
    update public.ds_ai_security_assessments
    set status = $2, error_code = $3, error_message = $4,
        lease_expires_at = null, heartbeat_at = now(), finished_at = now()
    where id = $1::uuid
  `, [
    assessment.id,
    input.status,
    requiredText(input.errorCode, 100, 'SECURITY_WORKER_FAILED'),
    requiredText(input.errorMessage, 1000, '安全评测执行失败'),
  ])

  let retry: FinalizableAssessmentRow | null = null
  if (input.status === 'failed' && input.scheduleRetry && !assessment.cancel_requested_at)
    retry = await scheduleAutomaticRetry(client, assessment, settings, state, currentConfig)
  await applyTerminalSubjectState(client, assessment, disposition, retry)
  await enqueueSecurityAudit(client, {
    action: input.status === 'failed' ? 'security.assessment.failed' : 'security.assessment.cancelled',
    actorUserId: null,
    code: requiredText(input.errorCode, 100, 'SECURITY_WORKER_FAILED'),
    metadata: {
      disposition,
      retryAssessmentId: retry?.id ?? null,
      subjectId: assessment.subject_id,
      subjectType: assessment.subject_type,
    },
    resourceId: assessment.id,
    resourceType: 'security_assessment',
    success: false,
  })
  return {
    assessmentId: assessment.id,
    disposition,
    retryAssessmentId: retry?.id ?? null,
    status: input.status,
  }
}

function freshInterval(subjectType: SecuritySubjectType, assessedAt: Date) {
  return freshUntilForSubject(subjectType, assessedAt)
}

async function hasCurrentBinding(
  client: PoolClient,
  assessmentId: string,
  subjectType: SecuritySubjectType,
  subjectId: string,
  declaredFingerprint: string,
) {
  const result = await client.query<{ exists: boolean }>(`
    select exists (
      select 1 from public.ds_ai_security_assessment_bindings
      where assessment_id = $1::uuid and subject_type = $2 and subject_id = $3::uuid
        and bound_declared_fingerprint = $4
    ) as exists
  `, [assessmentId, subjectType, subjectId, declaredFingerprint])
  return result.rows[0]?.exists === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function lockAssessment(client: PoolClient, assessmentId: string) {
  const result = await client.query<FinalizableAssessmentRow>(`
    select id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
           status, execution_profile, batch_id, declared_fingerprint,
           scanner_config_fingerprint, worker_id,
           lease_token, lease_version, lease_expires_at, cancel_requested_at,
           retry_root_id, attempt_number, created_by
    from public.ds_ai_security_assessments
    where id = $1::uuid
    for update
  `, [assessmentId])
  if (!result.rows[0])
    throw new AiSecurityError('SECURITY_ASSESSMENT_NOT_FOUND', 'Security assessment does not exist')
  return result.rows[0]
}

async function lockFinalizeSettings(client: PoolClient) {
  const result = await client.query<FinalizeSettingsRow>(`
    select max_attempts, required_scanner_config_fingerprints
    from public.ds_ai_security_settings
    where id = true
    for update
  `)
  if (!result.rows[0])
    throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security settings row is missing')
  return result.rows[0]
}

async function lockSubjectState(client: PoolClient, subjectType: SecuritySubjectType, subjectId: string) {
  const result = await client.query<FinalizeSubjectStateRow>(`
    select active_assessment_id, assessed_declared_fingerprint,
           current_declared_fingerprint, fresh_until, latest_assessment_id,
           report_state, scanner_config_fingerprint
    from public.ds_ai_security_subject_states
    where subject_type = $1 and subject_id = $2::uuid
    for update
  `, [subjectType, subjectId])
  if (!result.rows[0])
    throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security subject state is missing')
  return result.rows[0]
}

function normalizeEvaluationList(values: unknown, maximumItems: number, maximumLength: number) {
  if (!Array.isArray(values))
    return []
  return [...new Set(values
    .filter(value => typeof value === 'string')
    .map(value => sanitizeText(value, maximumLength))
    .filter(Boolean))]
    .slice(0, maximumItems)
}

function normalizeFinding(input: NormalizedSecurityFinding) {
  validateFingerprint(input.fingerprint)
  if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(input.riskCode))
    throw finalizationError('Finding 风险代码无效', 'SECURITY_REPORT_INVALID', 400)
  if (!['critical', 'high', 'medium', 'low', 'info'].includes(input.severity))
    throw finalizationError('Finding 严重级别无效', 'SECURITY_REPORT_INVALID', 400)
  const startLine = normalizeLine(input.startLine)
  const endLine = normalizeLine(input.endLine)
  if (endLine !== null && (startLine === null || endLine < startLine))
    throw finalizationError('Finding 行号范围无效', 'SECURITY_REPORT_INVALID', 400)
  return {
    artifactPath: optionalText(input.artifactPath, 1000),
    description: requiredText(input.description, 4000),
    endLine,
    evidenceRedacted: optionalText(input.evidenceRedacted, 8000),
    findingFingerprint: input.fingerprint,
    publicSummary: optionalText(input.publicSummary, 500),
    publicVisible: input.publicVisible === true,
    recommendation: optionalText(input.recommendation, 4000),
    riskCode: requiredText(input.riskCode, 100),
    severity: input.severity,
    startLine,
    title: requiredText(input.title, 200),
  }
}

function normalizeLine(value: number | null | undefined) {
  if (value === undefined || value === null)
    return null
  if (!Number.isSafeInteger(value) || value < 1)
    throw finalizationError('Finding 行号无效', 'SECURITY_REPORT_INVALID', 400)
  return value
}

function optionalText(value: string | null | undefined, maximum: number) {
  if (value === undefined || value === null)
    return null
  const text = sanitizeText(value, maximum)
  return text || null
}

async function promoteCompletedAssessment(
  client: PoolClient,
  assessment: FinalizableAssessmentRow,
  input: FinalizeAssessmentSuccessInput,
  score: ReturnType<typeof scoreFindings>,
  assessedAt: Date,
) {
  await client.query(`
    update public.ds_ai_security_subject_states
    set latest_assessment_id = $3::uuid,
        latest_attempt_id = $3::uuid,
        active_assessment_id = null,
        assessed_declared_fingerprint = $4,
        current_declared_fingerprint = $4,
        assessed_source_revision = $5,
        scanner_config_fingerprint = $6,
        report_state = $7,
        score = $8,
        grade = $9,
        verdict = $7,
        critical_count = $10,
        high_count = $11,
        medium_count = $12,
        low_count = $13,
        info_count = $14,
        fresh_until = $15,
        assessed_at = $16,
        stale_at = null,
        row_version = row_version + 1
    where subject_type = $1 and subject_id = $2::uuid
      and active_assessment_id = $3::uuid
  `, [
    assessment.subject_type,
    assessment.subject_id,
    assessment.id,
    assessment.declared_fingerprint,
    input.sourceRevision ?? null,
    assessment.scanner_config_fingerprint,
    score.verdict,
    score.score,
    score.grade,
    score.counts.critical,
    score.counts.high,
    score.counts.medium,
    score.counts.low,
    score.counts.info,
    freshInterval(assessment.subject_type, assessedAt),
    assessedAt,
  ])
}

function publicSubjectType(subjectType: SecuritySubjectType) {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return 'skill'
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return 'mcp'
  return 'prompt'
}

async function publishRequestedContent(client: PoolClient, subjectType: SecuritySubjectType, subjectId: string) {
  const table = subjectType === 'prompt' ? 'ds_prompts' : subjectType === 'skill' ? 'ds_skills' : subjectType === 'mcp' ? 'ds_mcps' : null
  if (!table)
    return
  const publisherUpdate = subjectType === 'prompt'
    ? 'published_by = coalesce(published_by, updated_by, created_by),'
    : ''
  await client.query(`
    update public.${table}
    set status = 'published',
        ${publisherUpdate}
        published_at = coalesce(published_at, now()),
        publish_requested_at = null
    where id = $1::uuid and status = 'draft' and publish_requested_at is not null
  `, [subjectId])
}

function requiredConfigFingerprint(settings: FinalizeSettingsRow, subjectType: SecuritySubjectType) {
  const fingerprint = settings.required_scanner_config_fingerprints[publicSubjectType(subjectType)]
  if (!fingerprint || !/^[0-9a-f]{64}$/.test(fingerprint))
    throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Required scanner configuration is missing')
  return fingerprint
}

function requiredText(value: unknown, maximum: number, fallback?: string) {
  const text = (typeof value === 'string' ? sanitizeText(value, maximum) : '') || (fallback ? sanitizeText(fallback, maximum) : '')
  if (!text)
    throw finalizationError('评测报告文本字段为空', 'SECURITY_REPORT_INVALID', 400)
  return text
}

function sanitizeText(value: string, maximum: number) {
  return [...value.normalize('NFC')].filter((character) => {
    const point = character.codePointAt(0) ?? 0
    return point === 9 || point === 10 || point === 13 || (point > 31 && point !== 127)
  }).join('').trim().slice(0, maximum)
}

async function saveCompletedAssessment(
  client: PoolClient,
  assessment: FinalizableAssessmentRow,
  input: FinalizeAssessmentSuccessInput,
  coverage: SecurityCoverage,
  score: ReturnType<typeof scoreFindings>,
  evaluation: SecurityTrustEvaluation,
) {
  await client.query(`
    update public.ds_ai_security_assessments
    set status = 'completed', input_fingerprint = $2,
        scanner_name = $3, scanner_version = $4, rules_version = $5,
        source_revision = $6, coverage = $7::jsonb, engine_score = $8,
        original_score = $9, original_grade = $10, original_verdict = $11,
        original_critical_count = $12, original_high_count = $13,
        original_medium_count = $14, original_low_count = $15,
        original_info_count = $16, summary = $17,
        quality_score = $18, quality_rating = $19,
        evaluation_summary = $20, evaluation_schema_version = $21,
        evaluation_method = $22, evaluation_model = $23,
        raw_report_file_id = $24::uuid,
        lease_expires_at = null, heartbeat_at = now(), finished_at = now(),
        error_code = null, error_message = null
    where id = $1::uuid
  `, [
    assessment.id,
    input.inputFingerprint,
    requiredText(input.scannerName, 100),
    requiredText(input.scannerVersion, 100),
    requiredText(input.rulesVersion, 100),
    optionalText(input.sourceRevision, 255),
    JSON.stringify(coverage),
    input.engineScore ?? null,
    score.score,
    score.grade,
    score.verdict,
    score.counts.critical,
    score.counts.high,
    score.counts.medium,
    score.counts.low,
    score.counts.info,
    optionalText(input.summary, 2000),
    evaluation.score,
    evaluation.rating,
    evaluation.summary,
    evaluation.schemaVersion,
    evaluation.method,
    evaluation.model,
    input.rawReportFileId ?? null,
  ])
}

async function saveDimensionScores(
  client: PoolClient,
  assessmentId: string,
  evaluation: SecurityTrustEvaluation,
) {
  for (const [index, dimension] of evaluation.dimensions.entries()) {
    await client.query(`
      insert into public.ds_ai_security_dimension_scores (
        assessment_id, dimension, score, summary, strengths, weaknesses,
        recommendations, evidence, source, display_order
      ) values ($1::uuid, $2, $3, $4, $5::text[], $6::text[], $7::text[], $8::text[], $9, $10)
    `, [
      assessmentId,
      dimension.code,
      dimension.score,
      dimension.summary,
      dimension.strengths,
      dimension.weaknesses,
      dimension.recommendations,
      dimension.evidence,
      dimension.source,
      index + 1,
    ])
  }
}

async function saveFindings(
  client: PoolClient,
  assessmentId: string,
  findings: ReturnType<typeof normalizeFinding>[],
) {
  for (const finding of findings) {
    await client.query(`
      insert into public.ds_ai_security_findings (
        assessment_id, risk_code, severity, title, description, recommendation,
        artifact_path, start_line, end_line, evidence_redacted, public_summary,
        finding_fingerprint, public_visible
      ) values (
        $1::uuid, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13
      )
      on conflict (assessment_id, finding_fingerprint) do nothing
    `, [
      assessmentId,
      finding.riskCode,
      finding.severity,
      finding.title,
      finding.description,
      finding.recommendation,
      finding.artifactPath,
      finding.startLine,
      finding.endLine,
      finding.evidenceRedacted,
      finding.publicSummary,
      finding.findingFingerprint,
      finding.publicVisible,
    ])
  }
}

async function scheduleAutomaticRetry(
  client: PoolClient,
  assessment: FinalizableAssessmentRow,
  settings: FinalizeSettingsRow,
  state: FinalizeSubjectStateRow,
  currentConfig: string,
) {
  const attempt = nextRetryAttempt(Number(assessment.attempt_number), settings.max_attempts)
  if (!attempt
    || state.current_declared_fingerprint !== assessment.declared_fingerprint
    || currentConfig !== assessment.scanner_config_fingerprint) {
    return null
  }
  const existing = await client.query<FinalizableAssessmentRow>(`
    select id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
           status, execution_profile, batch_id, declared_fingerprint,
           scanner_config_fingerprint, worker_id,
           lease_token, lease_version, lease_expires_at, cancel_requested_at,
           retry_root_id, attempt_number, created_by
    from public.ds_ai_security_assessments
    where retry_root_id = $1::uuid and attempt_number = $2
    limit 1
  `, [assessment.retry_root_id, attempt])
  if (existing.rows[0])
    return existing.rows[0]

  const retryId = randomUUID()
  const idempotencyKey = assessmentIdempotencyKey({
    batchId: assessment.batch_id,
    declaredFingerprint: assessment.declared_fingerprint,
    executionProfile: assessment.execution_profile,
    requestId: `${assessment.retry_root_id}:${attempt}`,
    scannerConfigFingerprint: assessment.scanner_config_fingerprint,
    subjectId: assessment.subject_id,
    subjectType: assessment.subject_type,
    trigger: 'retry',
  })
  const retry = await client.query<FinalizableAssessmentRow>(`
    insert into public.ds_ai_security_assessments (
      id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
      trigger, declared_fingerprint, scanner_config_fingerprint, idempotency_key,
      retry_of_id, retry_root_id, attempt_number, created_by,
      execution_profile, batch_id
    ) values (
      $1::uuid, $2, $3::uuid, $4, $5, 'retry', $6, $7, $8,
      $9::uuid, $10::uuid, $11, $12::uuid, $13, $14::uuid
    )
    returning id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
              status, execution_profile, batch_id, declared_fingerprint,
              scanner_config_fingerprint, worker_id,
              lease_token, lease_version, lease_expires_at, cancel_requested_at,
              retry_root_id, attempt_number, created_by
  `, [
    retryId,
    assessment.subject_type,
    assessment.subject_id,
    assessment.subject_name_snapshot,
    assessment.subject_slug_snapshot,
    assessment.declared_fingerprint,
    assessment.scanner_config_fingerprint,
    idempotencyKey,
    assessment.id,
    assessment.retry_root_id,
    attempt,
    assessment.created_by,
    assessment.execution_profile,
    assessment.batch_id,
  ])
  return retry.rows[0] ?? null
}

function validateEngineScore(value: number | null | undefined) {
  if (value === undefined || value === null)
    return
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw finalizationError('扫描引擎分数无效', 'SECURITY_REPORT_INVALID', 400)
}

function validateFingerprint(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw finalizationError('评测报告指纹无效', 'SECURITY_REPORT_INVALID', 400)
}

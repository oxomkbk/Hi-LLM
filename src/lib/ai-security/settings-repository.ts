import 'server-only'

import { databaseErrorCode, ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'
import { getLlmRuntimeConfig } from '@/lib/llm/settings'

import { enqueueSecurityAudit } from './audit-outbox'
import { sha256Canonical } from './canonical-json'
import { AiSecurityError } from './errors'
import { createLlmRuntimeIdentity } from './settings'

import type { SecurityMode } from './domain'
import type { Actor } from '@/lib/repositories/catalog'
import type { PoolClient } from 'pg'

export interface SecuritySettingsUpdate {
  confirmLlmIdentity?: unknown
  mcpMode?: unknown
  promptMode?: unknown
  publicShowGrade?: unknown
  publicShowRiskCounts?: unknown
  publicShowScore?: unknown
  publicShowSummary?: unknown
  skillMode?: unknown
  workerConcurrency?: unknown
}

interface SecuritySettingsRow {
  adapter_versions: Record<string, unknown>
  allowed_source_hosts: string[]
  confirmed_llm_identity: Record<string, unknown> | null
  daily_llm_budget: number
  job_timeout_seconds: number
  max_archive_depth: number
  max_attempts: number
  max_file_bytes: string
  max_files: number
  max_materialized_bytes: string
  max_queue_size: number
  max_repository_bytes: string
  max_text_bytes: string
  mcp_mode: SecurityMode
  prompt_mode: SecurityMode
  public_show_grade: boolean
  public_show_risk_counts: boolean
  public_show_score: boolean
  public_show_summary: boolean
  report_retention_days: number
  required_scanner_config_fingerprints: Record<string, string>
  service_enabled: boolean
  service_state_changed_at: Date
  service_state_changed_by: string | null
  service_state_version: string
  settings_version: string
  skill_mode: SecurityMode
  updated_at: Date
  updated_by: string | null
  worker_concurrency: number
}

export class SecuritySettingsServiceError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function getSecuritySettings() {
  try {
    const result = await queryBusiness<SecuritySettingsRow>(`${settingsSelect()} where id = true`)
    const row = result.rows[0]
    if (!row)
      throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security settings row is missing')
    return projectSettings(row)
  }
  catch (error) {
    throw mapSchemaError(error)
  }
}

export async function updateSecuritySettings(input: SecuritySettingsUpdate, actor: Actor) {
  const confirmLlmIdentity = input.confirmLlmIdentity === true
  const runtimeIdentity = confirmLlmIdentity
    ? createLlmRuntimeIdentity(await getLlmRuntimeConfig())
    : null

  try {
    return await withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const locked = await client.query<SecuritySettingsRow>(`${settingsSelect()} where id = true for update`)
      const current = locked.rows[0]
      if (!current)
        throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', 'Security settings row is missing')

      const modes = {
        mcpMode: normalizeMode(input.mcpMode, current.mcp_mode),
        promptMode: normalizeMode(input.promptMode, current.prompt_mode),
        skillMode: normalizeMode(input.skillMode, current.skill_mode),
      }
      const publicFlags = {
        publicShowGrade: normalizeBoolean(input.publicShowGrade, current.public_show_grade),
        publicShowRiskCounts: normalizeBoolean(input.publicShowRiskCounts, current.public_show_risk_counts),
        publicShowScore: normalizeBoolean(input.publicShowScore, current.public_show_score),
        publicShowSummary: normalizeBoolean(input.publicShowSummary, current.public_show_summary),
      }
      const workerConcurrency = normalizeInteger(input.workerConcurrency, current.worker_concurrency, 1, 4)
      const confirmedIdentity: Record<string, unknown> | null = runtimeIdentity
        ? { ...runtimeIdentity }
        : current.confirmed_llm_identity
      const nextFingerprints = requiredConfigurationFingerprints(current, confirmedIdentity)
      const changedFields = securitySettingsChangedFields(current, {
        ...modes,
        ...publicFlags,
        workerConcurrency,
      }, confirmLlmIdentity)

      const updated = await client.query<SecuritySettingsRow>(`
        update public.ds_ai_security_settings set
          skill_mode = $1, mcp_mode = $2, prompt_mode = $3,
          public_show_score = $4, public_show_grade = $5,
          public_show_risk_counts = $6, public_show_summary = $7,
          worker_concurrency = $8,
          confirmed_llm_identity = $9::jsonb,
          required_scanner_config_fingerprints = $10::jsonb,
          settings_version = settings_version + 1,
          updated_by = $11::uuid
        where id = true
        returning *
      `, [
        modes.skillMode,
        modes.mcpMode,
        modes.promptMode,
        publicFlags.publicShowScore,
        publicFlags.publicShowGrade,
        publicFlags.publicShowRiskCounts,
        publicFlags.publicShowSummary,
        workerConcurrency,
        JSON.stringify(confirmedIdentity),
        JSON.stringify(nextFingerprints),
        actor.id,
      ])

      await markConfigurationChangesStale(client, current.required_scanner_config_fingerprints, nextFingerprints)
      await enqueueSecurityAudit(client, {
        action: 'security.settings.update',
        actorUserId: actor.id,
        code: 'SECURITY_SETTINGS_UPDATED',
        metadata: {
          changedFields,
          llmIdentityConfirmed: confirmLlmIdentity,
          modes,
          nextSettingsVersion: Number(updated.rows[0]!.settings_version),
          previousSettingsVersion: Number(current.settings_version),
          publicFlags,
        },
        resourceId: 'singleton',
        resourceType: 'security_settings',
        success: true,
      })
      return projectSettings(updated.rows[0]!)
    })
  }
  catch (error) {
    throw mapSchemaError(error)
  }
}

function mapSchemaError(error: unknown): unknown {
  if (error instanceof AiSecurityError)
    return new SecuritySettingsServiceError('安全评测数据库尚未就绪', 503, error.code)
  if (databaseErrorCode(error) === '42P01' || databaseErrorCode((error as Error)?.cause) === '42P01')
    return new SecuritySettingsServiceError('安全评测数据库尚未就绪', 503, 'SECURITY_SCHEMA_NOT_READY')
  return error
}

async function markConfigurationChangesStale(
  client: PoolClient,
  previous: Record<string, string>,
  next: Record<string, string>,
) {
  for (const [publicType, subjectTypes] of Object.entries({
    mcp: ['mcp', 'mcp_submission'],
    prompt: ['prompt'],
    skill: ['skill', 'skill_submission'],
  })) {
    if (previous[publicType] === next[publicType])
      continue
    await client.query(`
      update public.ds_ai_security_subject_states
      set report_state = case when latest_assessment_id is null then 'unassessed' else 'stale' end,
          score = null, grade = null, verdict = null,
          stale_at = case when latest_assessment_id is null then stale_at else now() end,
          row_version = row_version + 1
      where subject_type = any($1::text[])
    `, [subjectTypes])
  }
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (value === undefined)
    return fallback
  if (typeof value !== 'boolean')
    throw new SecuritySettingsServiceError('安全设置布尔字段格式无效', 400, 'SECURITY_SETTINGS_INVALID')
  return value
}

function normalizeInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (value === undefined)
    return fallback
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum)
    throw new SecuritySettingsServiceError('安全设置数值超出允许范围', 400, 'SECURITY_SETTINGS_INVALID')
  return Number(value)
}

function normalizeMode(value: unknown, fallback: SecurityMode): SecurityMode {
  if (value === undefined)
    return fallback
  if (!['off', 'observe', 'warn', 'enforce'].includes(String(value)))
    throw new SecuritySettingsServiceError('安全模式无效', 400, 'SECURITY_SETTINGS_INVALID')
  return value as SecurityMode
}

function projectSettings(row: SecuritySettingsRow) {
  return {
    adapterVersions: row.adapter_versions,
    allowedSourceHosts: row.allowed_source_hosts,
    confirmedLlmIdentity: row.confirmed_llm_identity,
    limits: {
      dailyLlmBudget: row.daily_llm_budget,
      jobTimeoutSeconds: row.job_timeout_seconds,
      maxArchiveDepth: row.max_archive_depth,
      maxAttempts: row.max_attempts,
      maxFileBytes: Number(row.max_file_bytes),
      maxFiles: row.max_files,
      maxMaterializedBytes: Number(row.max_materialized_bytes),
      maxQueueSize: row.max_queue_size,
      maxRepositoryBytes: Number(row.max_repository_bytes),
      maxTextBytes: Number(row.max_text_bytes),
      reportRetentionDays: row.report_retention_days,
      workerConcurrency: row.worker_concurrency,
    },
    mcpMode: row.mcp_mode,
    promptMode: row.prompt_mode,
    publicShowGrade: row.public_show_grade,
    publicShowRiskCounts: row.public_show_risk_counts,
    publicShowScore: row.public_show_score,
    publicShowSummary: row.public_show_summary,
    requiredScannerConfigFingerprints: row.required_scanner_config_fingerprints,
    serviceEnabled: row.service_enabled,
    serviceStateChangedAt: row.service_state_changed_at.toISOString(),
    serviceStateChangedBy: row.service_state_changed_by,
    serviceStateVersion: Number(row.service_state_version),
    settingsVersion: Number(row.settings_version),
    skillMode: row.skill_mode,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  }
}

function requiredConfigurationFingerprints(
  settings: SecuritySettingsRow,
  confirmedLlmIdentity: Record<string, unknown> | null,
) {
  return Object.fromEntries(['skill', 'mcp', 'prompt'].map(subjectType => [
    subjectType,
    sha256Canonical({
      adapter: settings.adapter_versions[subjectType] ?? null,
      allowedSourceHosts: settings.allowed_source_hosts,
      confirmedLlmIdentity,
      limits: {
        maxArchiveDepth: settings.max_archive_depth,
        maxFileBytes: Number(settings.max_file_bytes),
        maxFiles: settings.max_files,
        maxMaterializedBytes: Number(settings.max_materialized_bytes),
        maxRepositoryBytes: Number(settings.max_repository_bytes),
        maxTextBytes: Number(settings.max_text_bytes),
      },
      schema: 'required-security-config-v1',
      subjectType,
    }),
  ]))
}

function securitySettingsChangedFields(
  current: SecuritySettingsRow,
  next: {
    mcpMode: SecurityMode
    promptMode: SecurityMode
    publicShowGrade: boolean
    publicShowRiskCounts: boolean
    publicShowScore: boolean
    publicShowSummary: boolean
    skillMode: SecurityMode
    workerConcurrency: number
  },
  llmIdentityConfirmed: boolean,
) {
  const fields: string[] = []
  const comparisons: Array<[string, unknown, unknown]> = [
    ['skillMode', current.skill_mode, next.skillMode],
    ['mcpMode', current.mcp_mode, next.mcpMode],
    ['promptMode', current.prompt_mode, next.promptMode],
    ['publicShowScore', current.public_show_score, next.publicShowScore],
    ['publicShowGrade', current.public_show_grade, next.publicShowGrade],
    ['publicShowRiskCounts', current.public_show_risk_counts, next.publicShowRiskCounts],
    ['publicShowSummary', current.public_show_summary, next.publicShowSummary],
    ['workerConcurrency', current.worker_concurrency, next.workerConcurrency],
  ]
  for (const [field, previous, value] of comparisons) {
    if (previous !== value)
      fields.push(field)
  }
  if (llmIdentityConfirmed)
    fields.push('confirmedLlmIdentity')
  return fields
}

function settingsSelect() {
  return `
    select adapter_versions, allowed_source_hosts, confirmed_llm_identity,
           daily_llm_budget, job_timeout_seconds, max_archive_depth, max_attempts,
           max_file_bytes, max_files, max_materialized_bytes, max_queue_size,
           max_repository_bytes, max_text_bytes, mcp_mode, prompt_mode,
           public_show_grade, public_show_risk_counts, public_show_score,
           public_show_summary, report_retention_days,
           required_scanner_config_fingerprints, settings_version, skill_mode,
           service_enabled, service_state_changed_at, service_state_changed_by,
           service_state_version, updated_at, updated_by, worker_concurrency
    from public.ds_ai_security_settings
  `
}

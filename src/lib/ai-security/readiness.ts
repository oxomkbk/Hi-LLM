import 'server-only'

import { getBusinessPool } from '@/lib/db/business'
import { getControlPool } from '@/lib/db/control'
import { getLlmRuntimeConfig } from '@/lib/llm/settings'

import { isSecurityWorkerLocalOnly } from './runtime-mode'
import { createLlmRuntimeIdentity } from './settings'
import { availableWorkerSubjectTypes, evaluateWorkerConfiguration, hasFatalWorkerIssue } from './worker-policy'

import type { SecurityMode, SecurityPublicSubjectType } from './domain'
import type { SecurityWorkerAdapterDescriptor, WorkerConfigurationIssue } from './worker-policy'

export interface SecurityWorkerReadiness {
  availableSubjectTypes: SecurityPublicSubjectType[]
  issues: WorkerConfigurationIssue[]
  operational: boolean
  ready: boolean
  serviceEnabled: boolean
  serviceStateVersion: number
  settings: {
    jobTimeoutSeconds: number
    workerConcurrency: number
  }
}

interface WorkerSettingsRow {
  adapter_versions: Record<string, unknown>
  confirmed_llm_identity: { fingerprint?: unknown } | null
  job_timeout_seconds: number
  mcp_mode: SecurityMode
  prompt_mode: SecurityMode
  required_scanner_config_fingerprints: Record<string, string>
  service_enabled: boolean
  service_state_version: string
  skill_mode: SecurityMode
  worker_concurrency: number
}

const REQUIRED_BUSINESS_RELATIONS = [
  'public.ds_ai_security_settings',
  'public.ds_ai_security_subject_states',
  'public.ds_ai_security_assessments',
  'public.ds_ai_security_assessment_bindings',
  'public.ds_ai_security_findings',
  'public.ds_ai_security_dimension_scores',
  'public.ds_ai_security_audit_outbox',
  'public.ds_ai_security_worker_heartbeats',
] as const

export async function checkSecurityWorkerReadiness(
  adapters: readonly SecurityWorkerAdapterDescriptor[],
  options: { executionProfile?: 'configured' | 'local_deterministic' } = {},
): Promise<SecurityWorkerReadiness> {
  const schemaIssues = await checkRequiredSchemas()
  if (schemaIssues.length > 0)
    return notReady(schemaIssues)

  let settings: WorkerSettingsRow
  try {
    const result = await (await getBusinessPool()).query<WorkerSettingsRow>(`
      select skill_mode, mcp_mode, prompt_mode, worker_concurrency,
             job_timeout_seconds, adapter_versions,
             required_scanner_config_fingerprints, confirmed_llm_identity,
             service_enabled, service_state_version
      from public.ds_ai_security_settings
      where id = true
    `)
    if (!result.rows[0])
      return notReady([schemaIssue('Security settings row is missing')])
    settings = result.rows[0]
  }
  catch {
    return notReady([schemaIssue('Security settings cannot be read')])
  }

  const serviceStateVersion = Number(settings.service_state_version)
  if (!Number.isSafeInteger(serviceStateVersion) || serviceStateVersion < 1)
    return notReady([schemaIssue('Security service state version is invalid')])
  if (!settings.service_enabled) {
    return {
      availableSubjectTypes: [],
      issues: [],
      operational: true,
      ready: true,
      serviceEnabled: false,
      serviceStateVersion,
      settings: {
        jobTimeoutSeconds: Number(settings.job_timeout_seconds),
        workerConcurrency: Number(settings.worker_concurrency),
      },
    }
  }
  const modes = {
    mcp: settings.mcp_mode,
    prompt: settings.prompt_mode,
    skill: settings.skill_mode,
  } as const
  const localOnly = options.executionProfile === 'local_deterministic' || isSecurityWorkerLocalOnly()
  const enabledLlmAdapter = !localOnly
    && adapters.some(adapter => adapter.usesLlm && modes[adapter.publicSubjectType] !== 'off')
  const runtimeLlmFingerprint = enabledLlmAdapter ? await readRuntimeLlmFingerprint() : null
  const confirmedLlmFingerprint = typeof settings.confirmed_llm_identity?.fingerprint === 'string'
    ? settings.confirmed_llm_identity.fingerprint
    : null
  const issues = evaluateWorkerConfiguration({
    adapters,
    confirmedLlmFingerprint,
    modes,
    requiredConfigFingerprints: settings.required_scanner_config_fingerprints,
    runtimeLlmFingerprint,
    skipLlmChecks: localOnly,
    versionSettings: settings.adapter_versions,
  })
  for (const adapter of adapters) {
    if (localOnly || modes[adapter.publicSubjectType] === 'off' || !adapter.checkReadiness)
      continue
    try {
      await adapter.checkReadiness()
    }
    catch {
      issues.push({
        code: 'SECURITY_ADAPTER_NOT_READY',
        message: `${adapter.publicSubjectType} scanner service is not ready`,
        subjectType: adapter.publicSubjectType,
      })
    }
  }
  return {
    availableSubjectTypes: availableWorkerSubjectTypes(modes, issues),
    issues,
    operational: !hasFatalWorkerIssue(issues),
    ready: issues.length === 0,
    serviceEnabled: true,
    serviceStateVersion,
    settings: {
      jobTimeoutSeconds: Number(settings.job_timeout_seconds),
      workerConcurrency: Number(settings.worker_concurrency),
    },
  }
}

async function checkRequiredSchemas() {
  const issues: WorkerConfigurationIssue[] = []
  try {
    const business = await getBusinessPool()
    const relationResult = await business.query<{ exists: boolean, relation_name: string }>(`
      select relation_name, to_regclass(relation_name) is not null as exists
      from unnest($1::text[]) as required(relation_name)
    `, [[...REQUIRED_BUSINESS_RELATIONS]])
    for (const relation of relationResult.rows) {
      if (!relation.exists)
        issues.push(schemaIssue(`Required business relation is missing: ${relation.relation_name}`))
    }
  }
  catch {
    issues.push(schemaIssue('Business security schema cannot be inspected'))
  }

  try {
    const controlResult = await getControlPool().query<{ exists: boolean }>(`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'control' and table_name = 'audit_logs'
          and column_name = 'external_event_id'
      ) as exists
    `)
    if (controlResult.rows[0]?.exists !== true)
      issues.push(schemaIssue('Control audit idempotency column is missing'))
  }
  catch {
    issues.push(schemaIssue('Control audit schema cannot be inspected'))
  }
  return issues
}

function notReady(issues: WorkerConfigurationIssue[]): SecurityWorkerReadiness {
  return {
    availableSubjectTypes: [],
    issues,
    operational: false,
    ready: false,
    serviceEnabled: false,
    serviceStateVersion: 0,
    settings: { jobTimeoutSeconds: 600, workerConcurrency: 1 },
  }
}

async function readRuntimeLlmFingerprint() {
  try {
    return createLlmRuntimeIdentity(await getLlmRuntimeConfig()).fingerprint
  }
  catch {
    return null
  }
}

function schemaIssue(message: string): WorkerConfigurationIssue {
  return { code: 'SECURITY_SCHEMA_NOT_READY', message }
}

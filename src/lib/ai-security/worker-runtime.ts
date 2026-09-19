import 'server-only'

import { getBusinessPool, queryBusiness } from '@/lib/db/business'

import { isSecurityWorkerLocalOnly } from './runtime-mode'
import { SECURITY_WORKER_GENERATION } from './worker-generation'
import { aggregateSecurityWorkerState } from './worker-runtime-policy'

import type { SecurityPublicSubjectType } from './domain'
import type { SecurityWorkerReadiness } from './readiness'

export interface SecurityWorkerRuntime {
  acknowledgedWorkerCount: number
  issues: Array<{ code: string, message: string, subjectType?: SecurityPublicSubjectType }>
  incompatibleWorkerCount: number
  executionMode: 'configured' | 'local_deterministic'
  lastSeenAt: string | null
  queue: {
    inFlight: number
    oldestQueuedAt: string | null
    queued: number
  }
  readySubjectTypes: SecurityPublicSubjectType[]
  requiredWorkerGeneration: string
  serviceAcknowledged: boolean
  serviceEnabled: boolean
  serviceStateChangedAt: string
  serviceStateChangedBy: string | null
  serviceStateVersion: number
  status: 'degraded' | 'offline' | 'paused' | 'ready' | 'starting'
  workerCount: number
}

interface QueueRuntimeRow {
  in_flight: string
  oldest_queued_at: Date | null
  queued: string
}

interface RuntimeSettingsRow {
  required_worker_generation: string
  service_enabled: boolean
  service_state_changed_at: Date
  service_state_changed_by: string | null
  service_state_version: string
}

interface WorkerRuntimeRow {
  issues: SecurityWorkerRuntime['issues']
  last_seen_at: Date
  observed_service_state_version: string
  ready_subject_types: SecurityPublicSubjectType[]
  status: 'degraded' | 'paused' | 'ready'
  worker_generation: string
}

export async function getSecurityWorkerRuntime(): Promise<SecurityWorkerRuntime> {
  const pool = await getBusinessPool()
  const [settingsResult, heartbeatResult, queueResult] = await Promise.all([
    pool.query<RuntimeSettingsRow>(`
      select service_enabled, service_state_version, required_worker_generation,
             service_state_changed_at, service_state_changed_by
      from public.ds_ai_security_settings
      where id = true
    `),
    pool.query<WorkerRuntimeRow>(`
      select status, ready_subject_types, issues, last_seen_at,
             worker_generation,
             observed_service_state_version
      from public.ds_ai_security_worker_heartbeats
      where last_seen_at >= now() - interval '75 seconds'
      order by last_seen_at desc
    `),
    pool.query<QueueRuntimeRow>(`
      select count(*) filter (where status = 'queued')::text as queued,
             count(*) filter (where status in ('preparing', 'running'))::text as in_flight,
             min(created_at) filter (where status = 'queued') as oldest_queued_at
      from public.ds_ai_security_assessments
    `),
  ])
  const settings = settingsResult.rows[0]
  if (!settings)
    throw new Error('Security settings row is missing')

  const heartbeats = heartbeatResult.rows.map(row => ({
    issues: row.issues,
    lastSeenAt: row.last_seen_at,
    observedServiceStateVersion: Number(row.observed_service_state_version),
    readySubjectTypes: row.ready_subject_types,
    status: row.status,
    workerGeneration: row.worker_generation,
  }))
  const compatibleHeartbeats = heartbeats.filter(
    heartbeat => heartbeat.workerGeneration === settings.required_worker_generation,
  )
  const aggregate = aggregateSecurityWorkerState({
    heartbeats: compatibleHeartbeats,
    serviceEnabled: settings.service_enabled,
    serviceStateVersion: Number(settings.service_state_version),
  })
  const acknowledged = aggregate.acknowledgedHeartbeats
  const readySubjectTypes = [...new Set(acknowledged.flatMap(row => row.readySubjectTypes))]
    .filter(isPublicSubjectType)
  const issues = deduplicateIssues(acknowledged.flatMap(row => row.issues))
  const queue = queueResult.rows[0]
  return {
    acknowledgedWorkerCount: acknowledged.length,
    executionMode: isSecurityWorkerLocalOnly() ? 'local_deterministic' : 'configured',
    incompatibleWorkerCount: heartbeats.length - compatibleHeartbeats.length,
    issues,
    lastSeenAt: compatibleHeartbeats[0]?.lastSeenAt.toISOString() ?? null,
    queue: {
      inFlight: Number(queue?.in_flight ?? 0),
      oldestQueuedAt: queue?.oldest_queued_at?.toISOString() ?? null,
      queued: Number(queue?.queued ?? 0),
    },
    readySubjectTypes,
    requiredWorkerGeneration: settings.required_worker_generation,
    serviceAcknowledged: aggregate.serviceAcknowledged,
    serviceEnabled: settings.service_enabled,
    serviceStateChangedAt: settings.service_state_changed_at.toISOString(),
    serviceStateChangedBy: settings.service_state_changed_by,
    serviceStateVersion: Number(settings.service_state_version),
    status: aggregate.status,
    workerCount: compatibleHeartbeats.length,
  }
}

export async function recordSecurityWorkerHeartbeat(
  workerId: string,
  readiness: SecurityWorkerReadiness,
  workerGeneration = SECURITY_WORKER_GENERATION,
) {
  await queryBusiness(`
    insert into public.ds_ai_security_worker_heartbeats (
      worker_id, status, ready_subject_types, issues,
      observed_service_state_version, worker_generation, started_at, last_seen_at
    ) values ($1, $2, $3::text[], $4::jsonb, $5, $6, now(), now())
    on conflict (worker_id) do update set
      status = excluded.status,
      ready_subject_types = excluded.ready_subject_types,
      issues = excluded.issues,
      observed_service_state_version = excluded.observed_service_state_version,
      worker_generation = excluded.worker_generation,
      last_seen_at = now()
  `, [
    workerId,
    !readiness.serviceEnabled ? 'paused' : readiness.ready ? 'ready' : 'degraded',
    readiness.availableSubjectTypes,
    JSON.stringify(readiness.issues),
    readiness.serviceStateVersion,
    normalizeWorkerGeneration(workerGeneration),
  ])
}

function deduplicateIssues(issues: SecurityWorkerRuntime['issues']) {
  const unique = new Map<string, SecurityWorkerRuntime['issues'][number]>()
  for (const issue of issues)
    unique.set(`${issue.code}:${issue.subjectType ?? 'global'}:${issue.message}`, issue)
  return [...unique.values()].slice(0, 12)
}

function isPublicSubjectType(value: string): value is SecurityPublicSubjectType {
  return value === 'skill' || value === 'mcp' || value === 'prompt'
}

function normalizeWorkerGeneration(value: string) {
  const normalized = value.normalize('NFC').trim()
  if (normalized.length < 8 || normalized.length > 120)
    throw new TypeError('Invalid security worker generation')
  return normalized
}

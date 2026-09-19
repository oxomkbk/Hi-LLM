import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

import { applyBackfillLimit } from './subjects'

import type { SecurityPublicSubjectType, SecuritySubjectType } from '../domain'
import type { SecurityWorkerReadiness } from '../readiness'
import type { BackfillPublicType, BackfillScopeEntry } from './subjects'
import type { PoolClient } from 'pg'

export interface SecurityBackfillOptions {
  apply: boolean
  limit?: number
  types: BackfillPublicType[]
}

export interface SecurityBackfillSummary {
  apply: boolean
  batchId: string | null
  batchScope: number
  cache: Record<string, number | string[]> | null
  errorCounts: Record<string, number>
  failedSubjects: number
  recoveredBatchIds: string[]
  resumed: boolean
  syncCounters: Record<string, number>
  syncScope: number
  terminal: Record<string, number>
  unreadable: Array<{ code: string, id: string, subjectType: string }>
}

interface BatchTerminalRow {
  error_code: string | null
  evaluation_method: string | null
  original_verdict: string | null
  status: string
}

const PUBLIC_TYPE_ORDER: BackfillPublicType[] = ['skill', 'mcp', 'prompt']
const ADVISORY_LOCK_NAME = 'hillm-nav:local-deterministic-security-backfill:v1'

export function assertBatchEnqueueResults(
  batchId: string,
  scope: readonly Pick<BackfillScopeEntry, 'id' | 'subjectType'>[],
  results: readonly {
    assessment: {
      batch_id: string | null
      execution_profile: 'configured' | 'local_deterministic'
      subject_id: string
      subject_type: SecuritySubjectType
    }
  }[],
) {
  if (results.length !== scope.length)
    throw backfillError('SECURITY_BACKFILL_SCOPE_CONFLICT', '本地安全回填批次范围冲突：入队结果数量不一致')
  for (const [index, result] of results.entries()) {
    const expected = scope[index]!
    const assessment = result.assessment
    if (assessment.batch_id !== batchId
      || assessment.execution_profile !== 'local_deterministic'
      || assessment.subject_id !== expected.id
      || assessment.subject_type !== expected.subjectType) {
      throw backfillError(
        'SECURITY_BACKFILL_SCOPE_CONFLICT',
        `本地安全回填批次范围冲突：${expected.subjectType}:${expected.id} 已被其他评测任务占用`,
      )
    }
  }
}

export function assertLocalBackfillReadiness(
  readiness: {
    availableSubjectTypes: readonly SecurityPublicSubjectType[]
    issues: readonly { code: string }[]
    operational: boolean
    serviceEnabled: boolean
  },
  requiredSubjectTypes: readonly SecurityPublicSubjectType[],
) {
  if (!readiness.operational) {
    throw backfillError(
      'SECURITY_BACKFILL_NOT_READY',
      `本地安全回填基础设施未就绪：${readiness.issues.map(issue => issue.code).join(', ') || '未知配置错误'}`,
    )
  }
  if (!readiness.serviceEnabled)
    throw backfillError('SECURITY_BACKFILL_NOT_READY', '本地安全回填无法开始：评测服务已暂停')
  const available = new Set(readiness.availableSubjectTypes)
  const unavailable = requiredSubjectTypes.filter(subjectType => !available.has(subjectType))
  if (unavailable.length > 0) {
    throw backfillError(
      'SECURITY_BACKFILL_NOT_READY',
      `本地安全回填适配器不可用：${unavailable.join(', ')}`,
    )
  }
}

export function exitCodeForBackfill(input: {
  failedSubjects: number
  infrastructureFailed: boolean
  interrupted: boolean
}) {
  if (input.interrupted)
    return 130
  if (input.infrastructureFailed)
    return 1
  return input.failedSubjects > 0 ? 2 : 0
}

export function parseBackfillArgs(args: readonly string[]): SecurityBackfillOptions {
  let apply = false
  let limit: number | undefined
  let types: BackfillPublicType[] = [...PUBLIC_TYPE_ORDER]
  for (const argument of args) {
    if (argument === '--dry-run') {
      apply = false
      continue
    }
    if (argument === '--apply') {
      apply = true
      continue
    }
    if (argument.startsWith('--limit=')) {
      const parsed = Number(argument.slice('--limit='.length))
      if (!Number.isSafeInteger(parsed) || parsed < 1)
        throw new TypeError('Backfill limit must be a positive integer')
      limit = parsed
      continue
    }
    if (argument.startsWith('--types=')) {
      const values = argument.slice('--types='.length).split(',').map(value => value.trim()).filter(Boolean)
      if (values.length === 0 || values.some(value => !PUBLIC_TYPE_ORDER.includes(value as BackfillPublicType)))
        throw new TypeError('Backfill types must be skill,mcp,prompt')
      const selected = new Set(values as BackfillPublicType[])
      types = PUBLIC_TYPE_ORDER.filter(value => selected.has(value))
      continue
    }
    throw new TypeError(`Unknown security backfill argument: ${argument}`)
  }
  return { apply, limit, types }
}

export async function produceWithBackpressure<T, R>(
  values: readonly T[],
  enqueue: (value: T) => Promise<R>,
  wait: () => Promise<void>,
) {
  const results: R[] = []
  for (const value of values) {
    for (;;) {
      try {
        results.push(await enqueue(value))
        break
      }
      catch (error) {
        if (errorCode(error) !== 'SECURITY_QUEUE_FULL')
          throw error
        await wait()
      }
    }
  }
  return results
}

export async function runSecurityBackfill(
  options: SecurityBackfillOptions,
  runtime: {
    onProgress?: (event: Readonly<Record<string, unknown>>) => void
    signal?: AbortSignal
  } = {},
): Promise<SecurityBackfillSummary> {
  const onProgress = runtime.onProgress ?? (() => undefined)
  const [{ reconcileSecuritySubjects }, { getBusinessPool }, queueModule] = await Promise.all([
    import('./subjects'),
    import('@/lib/db/business'),
    import('../queue'),
  ])

  if (!options.apply) {
    const reconciled = await reconcileSecuritySubjects({
      apply: false,
      types: options.types,
    })
    const batchScope = applyBackfillLimit(reconciled.candidates, options.limit)
    return {
      apply: false,
      batchId: null,
      batchScope: batchScope.length,
      cache: null,
      errorCounts: countCodes(reconciled.errors),
      failedSubjects: 0,
      recoveredBatchIds: [],
      resumed: false,
      syncCounters: reconciled.counters,
      syncScope: reconciled.syncScope.length,
      terminal: {},
      unreadable: reconciled.errors,
    }
  }

  const previousLocalOnly = process.env.AI_SECURITY_LOCAL_ONLY
  process.env.AI_SECURITY_LOCAL_ONLY = 'true'
  const pool = await getBusinessPool()
  const lockClient = await pool.connect()
  let locked = false
  try {
    throwIfAborted(runtime.signal)
    const lock = await lockClient.query<{ acquired: boolean }>(`
      select pg_try_advisory_lock(hashtext($1)) as acquired
    `, [ADVISORY_LOCK_NAME])
    if (lock.rows[0]?.acquired !== true)
      throw backfillError('SECURITY_BACKFILL_LOCKED', '另一个本地安全回填任务正在运行')
    locked = true
    await validateBackfillSchema(lockClient)

    const recoveredBatches = await listUnfinishedLocalBatches(lockClient)
    const recoveredBatchIds = recoveredBatches.map(batch => batch.batch_id)
    if (recoveredBatchIds.length > 0) {
      const recoveredSubjectTypes = uniquePublicSubjectTypes(recoveredBatches.flatMap(batch => batch.subject_types))
      const readiness = await preflightLocalBackfill(recoveredSubjectTypes)
      onProgress({ batchIds: recoveredBatchIds, code: 'SECURITY_BACKFILL_RECOVERY_STARTED' })
      await drainBatches(
        recoveredBatchIds,
        recoveredSubjectTypes,
        noProgressTimeoutMs(readiness),
        runtime.signal,
        onProgress,
      )
    }

    throwIfAborted(runtime.signal)
    const reconciled = await reconcileSecuritySubjects({
      apply: true,
      types: options.types,
    })
    const batchScope = applyBackfillLimit(reconciled.candidates, options.limit)
    if (batchScope.length === 0) {
      return {
        apply: true,
        batchId: null,
        batchScope: 0,
        cache: null,
        errorCounts: countCodes(reconciled.errors),
        failedSubjects: 0,
        recoveredBatchIds,
        resumed: recoveredBatchIds.length > 0,
        syncCounters: reconciled.counters,
        syncScope: reconciled.syncScope.length,
        terminal: {},
        unreadable: reconciled.errors,
      }
    }

    const batchId = randomUUID()
    const requiredSubjectTypes = uniquePublicSubjectTypes(batchScope.map(entry => entry.subjectType))
    const readiness = await preflightLocalBackfill(requiredSubjectTypes)
    const { SecurityGitSourceCache } = await import('../acquisition/source-cache')
    const sourceCache = new SecurityGitSourceCache()
    const controller = linkedAbortController(runtime.signal)
    let workerError: unknown = null
    const workerPromise = runBatchWorker([batchId], requiredSubjectTypes, controller.signal, sourceCache)
      .catch((error) => {
        workerError = error
        controller.abort(error)
      })
    let cacheSnapshot: Record<string, number | string[]> | null = null
    try {
      const enqueueResults = await produceWithBackpressure(
        batchScope,
        entry => queueModule.createBatchAssessmentJob({
          batchId,
          subjectId: entry.id,
          subjectType: entry.subjectType,
        }),
        async () => {
          throwIfAborted(controller.signal)
          await waitFor(500, controller.signal)
        },
      )
      assertBatchEnqueueResults(batchId, batchScope, enqueueResults)
      onProgress({
        batchId,
        code: 'SECURITY_BACKFILL_ENQUEUED',
        queued: enqueueResults.filter(result => result.assessment.batch_id === batchId).length,
        scope: batchScope.length,
      })
      await waitForBatches(
        [batchId],
        controller.signal,
        onProgress,
        noProgressTimeoutMs(readiness),
      )
      cacheSnapshot = sourceCache.snapshot()
    }
    finally {
      controller.abort()
      await workerPromise
    }
    if (workerError)
      throw workerError
    const terminal = await readBatchTerminalSummary(lockClient, batchId, batchScope.length)
    return {
      apply: true,
      batchId,
      batchScope: batchScope.length,
      cache: cacheSnapshot,
      errorCounts: mergeCounts(countCodes(reconciled.errors), terminal.errorCounts),
      failedSubjects: terminal.failed,
      recoveredBatchIds,
      resumed: recoveredBatchIds.length > 0,
      syncCounters: reconciled.counters,
      syncScope: reconciled.syncScope.length,
      terminal: terminal.counts,
      unreadable: reconciled.errors,
    }
  }
  finally {
    if (locked) {
      await lockClient.query('select pg_advisory_unlock(hashtext($1))', [ADVISORY_LOCK_NAME])
        .catch(() => undefined)
    }
    lockClient.release()
    if (previousLocalOnly === undefined)
      delete process.env.AI_SECURITY_LOCAL_ONLY
    else
      process.env.AI_SECURITY_LOCAL_ONLY = previousLocalOnly
  }
}

export function summarizeBatchTerminalRows(rows: readonly BatchTerminalRow[], expectedScope: number) {
  if (rows.length !== expectedScope) {
    throw backfillError(
      'SECURITY_BACKFILL_SCOPE_CONFLICT',
      `本地安全回填批次终态数量不一致：预期 ${expectedScope}，实际 ${rows.length}`,
    )
  }
  const counts: Record<string, number> = {}
  const errorCounts: Record<string, number> = {}
  let failed = 0
  for (const row of rows) {
    if (row.status !== 'completed' && row.status !== 'failed' && row.status !== 'cancelled') {
      throw backfillError(
        'SECURITY_BACKFILL_SCOPE_CONFLICT',
        `本地安全回填批次包含非终态记录：${row.status}`,
      )
    }
    const terminalKey = row.status === 'completed'
      ? row.original_verdict ?? 'completed'
      : row.status
    counts[terminalKey] = (counts[terminalKey] ?? 0) + 1
    if (row.status !== 'completed') {
      failed += 1
      const code = row.error_code ?? (row.status === 'cancelled'
        ? 'SECURITY_ASSESSMENT_CANCELLED'
        : 'SECURITY_WORKER_FAILED')
      errorCounts[code] = (errorCounts[code] ?? 0) + 1
    }
    if (row.status === 'completed' && row.evaluation_method !== 'document_evidence')
      throw backfillError('SECURITY_REPORT_INVALID', '本地批次没有生成材料证据报告')
  }
  return { counts, errorCounts, failed }
}

function backfillError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

function countCodes(values: readonly { code: string }[]) {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value.code] = (result[value.code] ?? 0) + 1
    return result
  }, {})
}

async function drainBatches(
  batchIds: readonly string[],
  requiredSubjectTypes: readonly SecurityPublicSubjectType[],
  maxNoProgressMs: number,
  signal: AbortSignal | undefined,
  onProgress: (event: Readonly<Record<string, unknown>>) => void,
) {
  const controller = linkedAbortController(signal)
  let workerError: unknown = null
  const workerPromise = runBatchWorker(batchIds, requiredSubjectTypes, controller.signal)
    .catch((error) => {
      workerError = error
      controller.abort(error)
    })
  try {
    await waitForBatches(batchIds, controller.signal, onProgress, maxNoProgressMs)
  }
  finally {
    controller.abort()
    await workerPromise
  }
  if (workerError)
    throw workerError
}

function errorCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string')
    return error.code
  return null
}

function linkedAbortController(signal?: AbortSignal) {
  const controller = new AbortController()
  if (signal?.aborted)
    controller.abort(signal.reason)
  else
    signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  return controller
}

async function listUnfinishedLocalBatches(client: PoolClient) {
  const result = await client.query<{ batch_id: string, subject_types: SecuritySubjectType[] }>(`
    select batch_id, array_agg(distinct subject_type order by subject_type) as subject_types
    from public.ds_ai_security_assessments
    where execution_profile = 'local_deterministic'
      and batch_id is not null
      and status in ('queued', 'preparing', 'running')
    group by batch_id
    order by batch_id
  `)
  return result.rows
}

function mergeCounts(left: Record<string, number>, right: Record<string, number>) {
  const merged = { ...left }
  for (const [code, count] of Object.entries(right))
    merged[code] = (merged[code] ?? 0) + count
  return merged
}

function noProgressTimeoutMs(readiness: SecurityWorkerReadiness) {
  return Math.max(180_000, Math.min(3_720_000, readiness.settings.jobTimeoutSeconds * 1000 + 120_000))
}

async function preflightLocalBackfill(requiredSubjectTypes: readonly SecurityPublicSubjectType[]) {
  const [{ mcpSecurityAdapter }, { promptSecurityAdapter }, { skillSecurityAdapter }, readinessModule] = await Promise.all([
    import('../adapters/mcp'),
    import('../adapters/prompt'),
    import('../adapters/skill'),
    import('../readiness'),
  ])
  const readiness = await readinessModule.checkSecurityWorkerReadiness(
    [skillSecurityAdapter, mcpSecurityAdapter, promptSecurityAdapter],
    { executionProfile: 'local_deterministic' },
  )
  assertLocalBackfillReadiness(readiness, requiredSubjectTypes)
  return readiness
}

function publicSubjectType(subjectType: SecuritySubjectType): SecurityPublicSubjectType {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return 'skill'
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return 'mcp'
  return 'prompt'
}

async function readBatchTerminalSummary(client: PoolClient, batchId: string, expectedScope: number) {
  const result = await client.query<BatchTerminalRow>(`
    select distinct on (subject_type, subject_id)
      status, original_verdict, evaluation_method, error_code
    from public.ds_ai_security_assessments
    where execution_profile = 'local_deterministic' and batch_id = $1::uuid
    order by subject_type, subject_id, attempt_number desc, created_at desc, id desc
  `, [batchId])
  return summarizeBatchTerminalRows(result.rows, expectedScope)
}

async function runBatchWorker(
  batchIds: readonly string[],
  requiredSubjectTypes: readonly SecurityPublicSubjectType[],
  signal: AbortSignal,
  sourceCache?: import('../acquisition/source-cache').SecurityGitSourceCache,
) {
  const [{ mcpSecurityAdapter }, { promptSecurityAdapter }, { skillSecurityAdapter }, workerModule] = await Promise.all([
    import('../adapters/mcp'),
    import('../adapters/prompt'),
    import('../adapters/skill'),
    import('../worker'),
  ])
  return workerModule.runSecurityWorker({
    adapters: [skillSecurityAdapter, mcpSecurityAdapter, promptSecurityAdapter],
    claimScope: { batchIds, executionProfile: 'local_deterministic' },
    failFastRequiredSubjectTypes: requiredSubjectTypes,
    maintenanceMode: 'leases_only',
    pollIntervalMs: 500,
    readinessIntervalMs: 5_000,
    signal,
    sourceCache,
    workerId: `${hostname()}:${process.pid}:security-backfill`,
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason ?? backfillError('SECURITY_BACKFILL_INTERRUPTED', '本地安全回填已中断')
}

function uniquePublicSubjectTypes(subjectTypes: readonly SecuritySubjectType[]) {
  const selected = new Set(subjectTypes.map(publicSubjectType))
  return (['skill', 'mcp', 'prompt'] as const).filter(subjectType => selected.has(subjectType))
}

async function validateBackfillSchema(client: PoolClient) {
  const result = await client.query<{
    batch_column: boolean
    execution_column: boolean
    mcp_scanner: string | null
    prompt_scanner: string | null
  }>(`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ds_ai_security_assessments'
          and column_name = 'execution_profile'
      ) as execution_column,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ds_ai_security_assessments'
          and column_name = 'batch_id'
      ) as batch_column,
      adapter_versions #>> '{mcp,scanner}' as mcp_scanner,
      adapter_versions #>> '{prompt,scanner}' as prompt_scanner
    from public.ds_ai_security_settings
    where id = true
  `)
  const row = result.rows[0]
  if (!row?.execution_column || !row.batch_column
    || row.mcp_scanner !== 'hillm-nav-mcp-trust@2'
    || row.prompt_scanner !== 'hillm-nav-prompt-trust@2') {
    throw backfillError('SECURITY_SCHEMA_NOT_READY', '请先应用本地安全回填业务迁移')
  }
}

function waitFor(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted)
    return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds)
    signal?.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
  })
}

async function waitForBatches(
  batchIds: readonly string[],
  signal: AbortSignal,
  onProgress: (event: Readonly<Record<string, unknown>>) => void,
  maxNoProgressMs: number,
) {
  const [{ getBusinessPool }, { reclaimExpiredAssessmentLeases }] = await Promise.all([
    import('@/lib/db/business'),
    import('../finalize'),
  ])
  const pool = await getBusinessPool()
  let lastMaintenanceAt = 0
  let lastProgressAt = Date.now()
  let lastProgressSignature = ''
  for (;;) {
    throwIfAborted(signal)
    if (Date.now() - lastMaintenanceAt >= 5_000) {
      await reclaimExpiredAssessmentLeases(100)
      lastMaintenanceAt = Date.now()
    }
    const status = await pool.query<{
      active: string
      completed: string
      failed: string
      last_changed_ms: string
      queued: string
    }>(`
      select
        count(*) filter (where status in ('queued', 'preparing', 'running'))::text as active,
        count(*) filter (where status = 'queued')::text as queued,
        count(*) filter (where status = 'completed')::text as completed,
        count(*) filter (where status = 'failed')::text as failed,
        coalesce(max(extract(epoch from greatest(
          coalesce(heartbeat_at, 'epoch'::timestamptz),
          coalesce(finished_at, 'epoch'::timestamptz),
          coalesce(started_at, 'epoch'::timestamptz),
          created_at
        )) * 1000), 0)::text as last_changed_ms
      from public.ds_ai_security_assessments
      where execution_profile = 'local_deterministic'
        and batch_id = any($1::uuid[])
    `, [[...batchIds]])
    const current = status.rows[0]!
    const progressSignature = [
      current.active,
      current.completed,
      current.failed,
      current.queued,
      current.last_changed_ms,
    ].join(':')
    if (progressSignature !== lastProgressSignature) {
      lastProgressSignature = progressSignature
      lastProgressAt = Date.now()
    }
    else if (Date.now() - lastProgressAt >= maxNoProgressMs) {
      throw backfillError(
        'SECURITY_BACKFILL_NO_PROGRESS',
        `本地安全回填在 ${Math.ceil(maxNoProgressMs / 1000)} 秒内没有进展，已停止以避免永久挂起`,
      )
    }
    onProgress({
      active: Number(current.active),
      batchIds,
      code: 'SECURITY_BACKFILL_PROGRESS',
      completed: Number(current.completed),
      failed: Number(current.failed),
      queued: Number(current.queued),
    })
    if (Number(current.active) === 0)
      return
    await waitFor(1_000, signal)
  }
}

import 'server-only'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { deleteFileObject } from '@/lib/files/service'

import { SecurityGitSourceCache } from './acquisition/source-cache'
import { dispatchSecurityAuditOutbox } from './audit-dispatcher'
import { AiSecurityError, isRetryableSecurityErrorCode } from './errors'
import { finalizeAssessmentSuccess, finalizeAssessmentTerminal, reclaimExpiredAssessmentLeases } from './finalize'
import { runSecurityMaintenance } from './maintenance'
import {
  claimAssessmentJobs,
  heartbeatAssessmentLease,
  isAssessmentCancellationRequested,
  markAssessmentRunning,
} from './queue'
import { checkSecurityWorkerReadiness } from './readiness'
import { recordSecurityWorkerHeartbeat } from './worker-runtime'

import type { SecurityPublicSubjectType, SecuritySubjectType } from './domain'
import type { FinalizeAssessmentSuccessInput } from './finalize'
import type { AssessmentQueueRow } from './queue'
import type { AssessmentClaimScope, LeaseIdentity } from './queue-policy'
import type { SecurityWorkerAdapterDescriptor, WorkerConfigurationIssue } from './worker-policy'

export interface SecurityWorkerAdapter extends SecurityWorkerAdapterDescriptor {
  execute: (context: SecurityWorkerAdapterContext) => Promise<SecurityWorkerAssessmentResult>
}

export interface SecurityWorkerAdapterContext {
  assessment: AssessmentQueueRow
  checkpoint: () => Promise<void>
  signal: AbortSignal
  sourceCache: SecurityGitSourceCache | null
  workspaceDirectory: string
}

export type SecurityWorkerAssessmentResult = Omit<FinalizeAssessmentSuccessInput, 'assessmentId' | 'lease'>

export interface SecurityWorkerLogger {
  error: (event: Readonly<Record<string, unknown>>) => void
  info: (event: Readonly<Record<string, unknown>>) => void
  warn: (event: Readonly<Record<string, unknown>>) => void
}

export interface SecurityWorkerOptions {
  adapters?: readonly SecurityWorkerAdapter[]
  auditIntervalMs?: number
  claimScope?: AssessmentClaimScope
  concurrencyCap?: number
  failFastRequiredSubjectTypes?: readonly SecurityPublicSubjectType[]
  heartbeatIntervalMs?: number
  leaseSeconds?: number
  logger?: SecurityWorkerLogger
  maintenanceMode?: 'full' | 'leases_only'
  maintenanceIntervalMs?: number
  pollIntervalMs?: number
  readinessIntervalMs?: number
  signal?: AbortSignal
  sourceCache?: SecurityGitSourceCache | null
  workerId: string
}

interface WorkerLoopOptions extends Required<Omit<SecurityWorkerOptions, 'signal'>> {
  signal: AbortSignal
}

class SecurityWorkerInterruption extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class SecurityWorkerReadinessError extends Error {
  constructor(readonly issues: readonly WorkerConfigurationIssue[]) {
    super('Security worker readiness checks failed')
  }
}

export async function executeClaimedAssessment(
  assessment: AssessmentQueueRow,
  adapter: SecurityWorkerAdapter,
  options: {
    heartbeatIntervalMs?: number
    jobTimeoutSeconds: number
    leaseSeconds?: number
    logger?: SecurityWorkerLogger
    signal?: AbortSignal
    sourceCache?: SecurityGitSourceCache | null
  },
) {
  const lease = assessmentLease(assessment)
  const logger = options.logger ?? defaultLogger()
  const controller = new AbortController()
  const externalSignal = options.signal
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'hillm-nav-ai-security-'))
  const heartbeatIntervalMs = clamp(options.heartbeatIntervalMs ?? 15_000, 1_000, 15_000)
  const leaseSeconds = clamp(options.leaseSeconds ?? 60, 30, 300)
  let heartbeatPromise: Promise<void> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const interrupt = (reason: SecurityWorkerInterruption) => {
    if (!controller.signal.aborted)
      controller.abort(reason)
  }
  const onExternalAbort = () => interrupt(new SecurityWorkerInterruption(
    'SECURITY_WORKER_SHUTDOWN',
    '安全评测 Worker 正在停止',
  ))
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  if (externalSignal?.aborted)
    onExternalAbort()

  const timeout = setTimeout(() => interrupt(new SecurityWorkerInterruption(
    'SECURITY_WORKER_TIMEOUT',
    '安全评测超过允许执行时间',
  )), clamp(options.jobTimeoutSeconds, 60, 3600) * 1000)

  const pulse = async () => {
    if (heartbeatPromise)
      return heartbeatPromise
    heartbeatPromise = (async () => {
      try {
        const row = await heartbeatAssessmentLease(assessment.id, lease, leaseSeconds)
        if (row.cancel_requested_at)
          interrupt(new SecurityWorkerInterruption('SECURITY_ASSESSMENT_CANCELLED', '管理员请求取消安全评测'))
      }
      catch {
        interrupt(new SecurityWorkerInterruption('SECURITY_LEASE_LOST', '安全评测租约已经失效'))
      }
      finally {
        heartbeatPromise = null
      }
    })()
    return heartbeatPromise
  }
  const stopHeartbeat = async () => {
    if (heartbeatTimer)
      clearInterval(heartbeatTimer)
    if (heartbeatPromise)
      await heartbeatPromise
  }

  try {
    if (await isAssessmentCancellationRequested(assessment.id, lease)) {
      return await finalizeAssessmentTerminal({
        assessmentId: assessment.id,
        errorCode: 'SECURITY_ASSESSMENT_CANCELLED',
        errorMessage: '安全评测已按管理员请求取消',
        lease,
        status: 'cancelled',
      })
    }
    try {
      await markAssessmentRunning(assessment.id, lease)
    }
    catch (error) {
      if (await cancellationRequestedAfterTransitionRace(assessment.id, lease)) {
        return await finalizeAssessmentTerminal({
          assessmentId: assessment.id,
          errorCode: 'SECURITY_ASSESSMENT_CANCELLED',
          errorMessage: '安全评测已按管理员请求取消',
          lease,
          status: 'cancelled',
        })
      }
      throw error
    }

    heartbeatTimer = setInterval(() => void pulse(), heartbeatIntervalMs)
    const result = await adapter.execute({
      assessment,
      checkpoint: async () => {
        await pulse()
        throwIfAborted(controller.signal)
      },
      signal: controller.signal,
      sourceCache: options.sourceCache ?? null,
      workspaceDirectory,
    })
    throwIfAborted(controller.signal)
    await pulse()
    throwIfAborted(controller.signal)
    await stopHeartbeat()
    try {
      return await finalizeAssessmentSuccess({
        ...result,
        assessmentId: assessment.id,
        lease,
      })
    }
    catch (error) {
      if (result.rawReportFileId)
        await deleteFileObject(result.rawReportFileId).catch(() => undefined)
      throw error
    }
  }
  catch (error) {
    await stopHeartbeat()
    const interruption = interruptionFrom(error, controller.signal)
    if (interruption.code === 'SECURITY_LEASE_LOST') {
      logger.warn({
        assessmentId: assessment.id,
        code: interruption.code,
        workerId: lease.workerId,
      })
      return { assessmentId: assessment.id, status: 'lease_lost' as const }
    }
    try {
      return await finalizeAssessmentTerminal({
        assessmentId: assessment.id,
        errorCode: interruption.code,
        errorMessage: interruption.message,
        lease,
        scheduleRetry: isRetryableSecurityErrorCode(interruption.code),
        status: interruption.code === 'SECURITY_ASSESSMENT_CANCELLED' ? 'cancelled' : 'failed',
      })
    }
    catch (finalizeError) {
      if (isLeaseLost(finalizeError)) {
        logger.warn({
          assessmentId: assessment.id,
          code: 'SECURITY_LEASE_LOST',
          workerId: lease.workerId,
        })
        return { assessmentId: assessment.id, status: 'lease_lost' as const }
      }
      throw finalizeError
    }
  }
  finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', onExternalAbort)
    await rm(workspaceDirectory, { force: true, recursive: true }).catch(() => undefined)
  }
}

export async function runSecurityWorker(options: SecurityWorkerOptions) {
  const signal = options.signal ?? new AbortController().signal
  const normalized = normalizeWorkerOptions(options, signal)
  const readiness = await checkSecurityWorkerReadiness(normalized.adapters, {
    executionProfile: normalized.claimScope.executionProfile,
  })
  assertFailFastWorkerReadiness(readiness, normalized.failFastRequiredSubjectTypes)
  if (readiness.operational) {
    try {
      await recordSecurityWorkerHeartbeat(normalized.workerId, readiness)
    }
    catch {
      normalized.logger.warn({ code: 'SECURITY_WORKER_HEARTBEAT_FAILED', workerId: normalized.workerId })
    }
    normalized.logger.info({
      availableSubjectTypes: readiness.availableSubjectTypes,
      code: !readiness.serviceEnabled
        ? 'SECURITY_WORKER_PAUSED'
        : readiness.ready ? 'SECURITY_WORKER_READY' : 'SECURITY_WORKER_DEGRADED',
      issues: readiness.issues,
      serviceStateVersion: readiness.serviceStateVersion,
      workerId: normalized.workerId,
    })
  }
  else {
    normalized.logger.error({
      code: 'SECURITY_WORKER_NOT_READY',
      issues: readiness.issues,
      workerId: normalized.workerId,
    })
  }
  try {
    await Promise.all([
      runAssessmentLoop(normalized),
      runAuditLoop(normalized),
      runMaintenanceLoop(normalized),
    ])
  }
  finally {
    normalized.sourceCache?.clear()
  }
}

function assertFailFastWorkerReadiness(
  readiness: Awaited<ReturnType<typeof checkSecurityWorkerReadiness>>,
  requiredSubjectTypes: readonly SecurityPublicSubjectType[],
) {
  if (requiredSubjectTypes.length === 0)
    return
  const available = new Set(readiness.availableSubjectTypes)
  const unavailable = requiredSubjectTypes.filter(subjectType => !available.has(subjectType))
  if (!readiness.operational || !readiness.serviceEnabled || unavailable.length > 0) {
    throw new AiSecurityError(
      'SECURITY_ADAPTER_NOT_READY',
      !readiness.serviceEnabled
        ? '本地安全回填无法继续：评测服务已暂停'
        : `本地安全回填无法继续：以下适配器不可用：${unavailable.join(', ') || '共享基础设施'}`,
    )
  }
}

function assessmentLease(assessment: AssessmentQueueRow): LeaseIdentity {
  if (!assessment.worker_id || !assessment.lease_token)
    throw new AiSecurityError('SECURITY_LEASE_LOST', 'Claimed assessment has no lease identity')
  return {
    leaseToken: assessment.lease_token,
    leaseVersion: Number(assessment.lease_version),
    workerId: assessment.worker_id,
  }
}

async function cancellationRequestedAfterTransitionRace(assessmentId: string, lease: LeaseIdentity) {
  try {
    return await isAssessmentCancellationRequested(assessmentId, lease)
  }
  catch {
    return false
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value))
    return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}

function defaultLogger(): SecurityWorkerLogger {
  return {
    error: event => console.error(JSON.stringify(event)),
    info: event => console.warn(JSON.stringify(event)),
    warn: event => console.warn(JSON.stringify(event)),
  }
}

function interruptionFrom(error: unknown, signal: AbortSignal) {
  if (signal.aborted && signal.reason instanceof SecurityWorkerInterruption)
    return signal.reason
  if (error instanceof SecurityWorkerInterruption)
    return error
  if (error instanceof AiSecurityError && error.code === 'SECURITY_LEASE_LOST')
    return new SecurityWorkerInterruption('SECURITY_LEASE_LOST', '安全评测租约已经失效')
  return new SecurityWorkerInterruption(safeErrorCode(error), safeErrorMessage(error))
}

function isLeaseLost(error: unknown) {
  return (error instanceof AiSecurityError && error.code === 'SECURITY_LEASE_LOST')
    || (typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: unknown }).code === 'SECURITY_LEASE_LOST')
}

function normalizeWorkerOptions(options: SecurityWorkerOptions, signal: AbortSignal): WorkerLoopOptions {
  const workerId = options.workerId.normalize('NFC').trim()
  if (!workerId || workerId.length > 180)
    throw new TypeError('Invalid security worker ID')
  return {
    adapters: options.adapters ?? [],
    auditIntervalMs: clamp(options.auditIntervalMs ?? 5_000, 1_000, 60_000),
    claimScope: options.claimScope ?? { executionProfile: 'configured' },
    concurrencyCap: clamp(options.concurrencyCap ?? 4, 1, 4),
    failFastRequiredSubjectTypes: options.failFastRequiredSubjectTypes ?? [],
    heartbeatIntervalMs: clamp(options.heartbeatIntervalMs ?? 15_000, 1_000, 15_000),
    leaseSeconds: clamp(options.leaseSeconds ?? 60, 30, 300),
    logger: options.logger ?? defaultLogger(),
    maintenanceMode: options.maintenanceMode ?? 'full',
    maintenanceIntervalMs: clamp(options.maintenanceIntervalMs ?? 60_000, 10_000, 300_000),
    pollIntervalMs: clamp(options.pollIntervalMs ?? 1_000, 250, 30_000),
    readinessIntervalMs: clamp(options.readinessIntervalMs ?? 30_000, 5_000, 300_000),
    signal,
    sourceCache: options.sourceCache
      ?? (options.claimScope?.executionProfile === 'local_deterministic'
        ? new SecurityGitSourceCache()
        : null),
    workerId,
  }
}

function publicSubjectType(subjectType: SecuritySubjectType): SecurityPublicSubjectType {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return 'skill'
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return 'mcp'
  return 'prompt'
}

function resolveAdapter(adapters: readonly SecurityWorkerAdapter[], subjectType: SecuritySubjectType) {
  const publicType = publicSubjectType(subjectType)
  return adapters.find(adapter => adapter.publicSubjectType === publicType) ?? null
}

async function runAssessmentLoop(options: WorkerLoopOptions) {
  let availableSubjectTypes: SecurityPublicSubjectType[] = []
  let readinessCheckedAt = 0
  let serviceEnabled = false
  let serviceStateVersion = 0
  let workerConcurrency = 1
  let jobTimeoutSeconds = 600
  let loggedServiceStateVersion = -1
  while (!options.signal.aborted) {
    const now = Date.now()
    if (now - readinessCheckedAt >= options.readinessIntervalMs) {
      const readiness = await checkSecurityWorkerReadiness(options.adapters, {
        executionProfile: options.claimScope.executionProfile,
      })
      assertFailFastWorkerReadiness(readiness, options.failFastRequiredSubjectTypes)
      readinessCheckedAt = now
      try {
        await recordSecurityWorkerHeartbeat(options.workerId, readiness)
      }
      catch {
        options.logger.warn({ code: 'SECURITY_WORKER_HEARTBEAT_FAILED', workerId: options.workerId })
      }
      if (!readiness.operational) {
        availableSubjectTypes = []
        serviceEnabled = false
        serviceStateVersion = 0
        options.logger.error({ code: 'SECURITY_WORKER_NOT_READY', issues: readiness.issues })
        await waitFor(options.readinessIntervalMs, options.signal)
        continue
      }
      serviceEnabled = readiness.serviceEnabled
      serviceStateVersion = readiness.serviceStateVersion
      availableSubjectTypes = readiness.availableSubjectTypes
      if (loggedServiceStateVersion !== serviceStateVersion) {
        options.logger.info({
          code: serviceEnabled ? 'SECURITY_WORKER_RESUMED' : 'SECURITY_WORKER_PAUSED',
          serviceStateVersion,
          workerId: options.workerId,
        })
        loggedServiceStateVersion = serviceStateVersion
      }
      if (serviceEnabled && !readiness.ready) {
        options.logger.warn({
          availableSubjectTypes,
          code: 'SECURITY_WORKER_DEGRADED',
          issues: readiness.issues,
          workerId: options.workerId,
        })
      }
      workerConcurrency = Math.min(readiness.settings.workerConcurrency, options.concurrencyCap)
      jobTimeoutSeconds = readiness.settings.jobTimeoutSeconds
    }

    if (!serviceEnabled) {
      await waitFor(options.readinessIntervalMs, options.signal)
      continue
    }

    if (availableSubjectTypes.length === 0) {
      await waitFor(options.readinessIntervalMs, options.signal)
      continue
    }

    let assessments: Awaited<ReturnType<typeof claimAssessmentJobs>>
    try {
      assessments = await claimAssessmentJobs(
        options.workerId,
        serviceStateVersion,
        workerConcurrency,
        options.leaseSeconds,
        availableSubjectTypes,
        options.claimScope,
      )
    }
    catch (error) {
      if (safeErrorCode(error) === 'SECURITY_SERVICE_STATE_CONFLICT')
        readinessCheckedAt = 0
      options.logger.warn({
        code: safeErrorCode(error),
        serviceStateVersion,
        workerId: options.workerId,
      })
      await waitFor(options.pollIntervalMs, options.signal)
      continue
    }
    if (assessments.length === 0) {
      await waitFor(options.pollIntervalMs, options.signal)
      continue
    }
    await Promise.all(assessments.map(async (assessment) => {
      const adapter = resolveAdapter(options.adapters, assessment.subject_type)
      try {
        if (!adapter) {
          await finalizeAssessmentTerminal({
            assessmentId: assessment.id,
            errorCode: 'SECURITY_ADAPTER_NOT_READY',
            errorMessage: `没有可用于 ${assessment.subject_type} 的安全扫描适配器`,
            lease: assessmentLease(assessment),
            status: 'failed',
          })
          return
        }
        await executeClaimedAssessment(assessment, adapter, {
          heartbeatIntervalMs: options.heartbeatIntervalMs,
          jobTimeoutSeconds,
          leaseSeconds: options.leaseSeconds,
          logger: options.logger,
          signal: options.signal,
          sourceCache: options.sourceCache,
        })
      }
      catch (error) {
        options.logger.error({
          assessmentId: assessment.id,
          code: safeErrorCode(error),
          workerId: options.workerId,
        })
      }
    }))
  }
}

async function runAuditLoop(options: WorkerLoopOptions) {
  while (!options.signal.aborted) {
    try {
      await dispatchSecurityAuditOutbox(50)
    }
    catch {
      options.logger.warn({ code: 'SECURITY_AUDIT_DISPATCH_FAILED', workerId: options.workerId })
    }
    await waitFor(options.auditIntervalMs, options.signal)
  }
}

async function runMaintenanceLoop(options: WorkerLoopOptions) {
  while (!options.signal.aborted) {
    try {
      const result = options.maintenanceMode === 'leases_only'
        ? await reclaimExpiredAssessmentLeases(20).then(leases => ({
            reclaimedLeases: leases.reclaimed,
            retriedLeases: leases.retried,
          }))
        : await runSecurityMaintenance(20)
      if (Object.values(result).some(value => value > 0))
        options.logger.info({ code: 'SECURITY_MAINTENANCE_COMPLETED', ...result })
    }
    catch {
      options.logger.warn({ code: 'SECURITY_MAINTENANCE_FAILED', workerId: options.workerId })
    }
    await waitFor(options.maintenanceIntervalMs, options.signal)
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof AiSecurityError)
    return error.code
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string')
    return error.code.slice(0, 100)
  return 'SECURITY_WORKER_FAILED'
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return [...error.message.normalize('NFC')].filter((character) => {
      const point = character.codePointAt(0) ?? 0
      return point === 9 || point === 10 || point === 13 || (point > 31 && point !== 127)
    }).join('').slice(0, 1000)
  }
  return '安全评测执行失败'
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted)
    throw signal.reason
}

function waitFor(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted)
    return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

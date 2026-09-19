import 'server-only'

import { ensureBusinessUser, withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'
import {
  getSecurityWorkerProcessState,
  runSecurityWorkerProcessAction,
  SecurityWorkerProcessError,
} from './worker-process'
import { getSecurityWorkerRuntime } from './worker-runtime'

import type { SecurityWorkerProcessAction, SecurityWorkerProcessState } from './worker-process'
import type { SecurityWorkerRuntime } from './worker-runtime'
import type { Actor } from '@/lib/repositories/catalog'

const SECURITY_WORKER_RESOURCE_ID = 'hillm-security-worker.service'

const controlState = globalThis as typeof globalThis & {
  __hillmSecurityWorkerControl?: { busy: boolean }
}

controlState.__hillmSecurityWorkerControl ??= { busy: false }

export interface SecurityWorkerControlResult extends SecurityWorkerControlSnapshot {
  action: SecurityWorkerProcessAction
  disposition: 'accepted' | 'noop'
}

export interface SecurityWorkerControlSnapshot {
  process: SecurityWorkerProcessState
  runtime: SecurityWorkerRuntime
}

export class SecurityWorkerControlError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function getSecurityWorkerControlSnapshot(): Promise<SecurityWorkerControlSnapshot> {
  const [processState, runtime] = await Promise.all([
    getSecurityWorkerProcessState(),
    getSecurityWorkerRuntime(),
  ])
  return { process: processState, runtime }
}

export async function requestSecurityWorkerControl(input: {
  action: SecurityWorkerProcessAction
  confirmInterrupt: boolean
}, actor: Actor): Promise<SecurityWorkerControlResult> {
  if (controlState.__hillmSecurityWorkerControl!.busy) {
    const error = new SecurityWorkerControlError(
      '另一项执行节点操作正在处理中，请稍后重试',
      409,
      'SECURITY_WORKER_CONTROL_BUSY',
    )
    await recordAuditSafely(actor, input.action, error.code, false, {
      disposition: 'rejected',
      reason: error.code,
    })
    throw error
  }

  controlState.__hillmSecurityWorkerControl!.busy = true
  let before: SecurityWorkerProcessState | null = null
  let runtime: SecurityWorkerRuntime | null = null
  try {
    const snapshot = await getSecurityWorkerControlSnapshot()
    before = snapshot.process
    runtime = snapshot.runtime
    assertControlAvailable(before)

    if (alreadyAtTarget(input.action, before)) {
      await recordAuditSafely(actor, input.action, `SECURITY_WORKER_${input.action.toUpperCase()}_NOOP`, true, {
        after: before,
        before,
        disposition: 'noop',
        inFlight: runtime.queue.inFlight,
      })
      return {
        action: input.action,
        disposition: 'noop',
        process: before,
        runtime,
      }
    }

    if (input.action === 'stop' && runtime.queue.inFlight > 0 && !input.confirmInterrupt) {
      throw new SecurityWorkerControlError(
        `当前有 ${runtime.queue.inFlight} 个任务正在执行，确认后可安全中断并自动重试`,
        409,
        'SECURITY_WORKER_ACTIVE_JOBS',
      )
    }

    const processState = await runSecurityWorkerProcessAction(input.action)
    await recordAuditSafely(actor, input.action, `SECURITY_WORKER_${input.action.toUpperCase()}_REQUESTED`, true, {
      after: processState,
      before,
      disposition: 'accepted',
      inFlight: runtime.queue.inFlight,
    })
    return {
      action: input.action,
      disposition: 'accepted',
      process: processState,
      runtime,
    }
  }
  catch (error) {
    const typed = normalizeControlError(error)
    await recordAuditSafely(actor, input.action, typed.code, false, {
      before,
      disposition: typed.status === 409 ? 'rejected' : 'failed',
      inFlight: runtime?.queue.inFlight ?? null,
      reason: typed.code,
    })
    throw typed
  }
  finally {
    controlState.__hillmSecurityWorkerControl!.busy = false
  }
}

function alreadyAtTarget(action: SecurityWorkerProcessAction, state: SecurityWorkerProcessState) {
  if (action === 'start')
    return state.status === 'active' && state.enabledAtBoot === true
  return state.status === 'inactive' && state.enabledAtBoot === false
}

function assertControlAvailable(state: SecurityWorkerProcessState) {
  if (state.controlAvailable)
    return
  if (state.controlUnavailableReason === 'permission_denied') {
    throw new SecurityWorkerControlError(
      '服务器未允许读取执行节点状态',
      503,
      'SECURITY_WORKER_PERMISSION_DENIED',
    )
  }
  throw new SecurityWorkerControlError(
    state.controlUnavailableReason === 'unit_not_found'
      ? '服务器尚未安装执行节点服务'
      : state.controlUnavailableReason === 'disabled'
        ? '执行节点控制已通过环境配置关闭'
        : '当前主机不支持执行节点控制',
    503,
    'SECURITY_WORKER_CONTROL_UNAVAILABLE',
  )
}

function normalizeControlError(error: unknown) {
  if (error instanceof SecurityWorkerControlError)
    return error
  if (error instanceof SecurityWorkerProcessError)
    return new SecurityWorkerControlError(error.message, error.status, error.code)
  return new SecurityWorkerControlError(
    '执行节点控制失败，请稍后重试',
    500,
    'SECURITY_WORKER_CONTROL_FAILED',
  )
}

async function recordAuditSafely(
  actor: Actor,
  action: SecurityWorkerProcessAction,
  code: string,
  success: boolean,
  metadata: Readonly<Record<string, unknown>>,
) {
  try {
    await withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const disposition = metadata.disposition
      const auditAction = success && disposition === 'accepted'
        ? `security.worker.${action}_requested`
        : success && disposition === 'noop'
          ? `security.worker.${action}_noop`
          : metadata.disposition === 'rejected'
            ? `security.worker.${action}_rejected`
            : `security.worker.${action}_failed`
      await enqueueSecurityAudit(client, {
        action: auditAction,
        actorUserId: actor.id,
        code,
        metadata,
        resourceId: SECURITY_WORKER_RESOURCE_ID,
        resourceType: 'security_worker_process',
        success,
      })
    })
  }
  catch {
    console.error({
      action,
      code: 'SECURITY_WORKER_AUDIT_WRITE_FAILED',
    })
  }
}

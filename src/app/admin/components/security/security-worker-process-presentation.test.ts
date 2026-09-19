import { describe, expect, it } from 'vitest'

import { bootLabel, processCopy, unavailableControlCopy } from './security-worker-process-presentation'

import type { SecurityWorkerProcessState } from '@/lib/ai-security/worker-process'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

const processState: SecurityWorkerProcessState = {
  controlAvailable: true,
  controlUnavailableReason: null,
  enabledAtBoot: true,
  mainPid: 2741,
  status: 'active',
  statusDetail: 'active',
  unit: 'hillm-security-worker.service',
}
const runtime: SecurityWorkerRuntime = {
  acknowledgedWorkerCount: 1,
  executionMode: 'local_deterministic',
  incompatibleWorkerCount: 0,
  issues: [],
  lastSeenAt: '2026-09-12T00:00:00.000Z',
  queue: { inFlight: 0, oldestQueuedAt: null, queued: 0 },
  readySubjectTypes: ['skill'],
  requiredWorkerGeneration: 'generation-1',
  serviceAcknowledged: true,
  serviceEnabled: true,
  serviceStateChangedAt: '2026-09-12T00:00:00.000Z',
  serviceStateChangedBy: null,
  serviceStateVersion: 1,
  status: 'ready',
  workerCount: 1,
}

describe('security worker process presentation', () => {
  it('distinguishes a healthy process from one waiting for heartbeat', () => {
    expect(processCopy(processState, runtime)).toMatchObject({
      title: '执行节点运行中',
      tone: 'active',
    })
    expect(processCopy(processState, { ...runtime, status: 'offline', workerCount: 0 })).toMatchObject({
      title: '等待节点就绪',
      tone: 'warning',
    })
  })

  it('keeps systemd failures visually distinct from an intentional stop', () => {
    expect(processCopy({ ...processState, mainPid: null, status: 'failed', statusDetail: 'failed' }, runtime)).toMatchObject({
      title: '执行节点启动失败',
      tone: 'danger',
    })
    expect(processCopy({ ...processState, enabledAtBoot: false, mainPid: null, status: 'inactive', statusDetail: 'inactive' }, runtime)).toMatchObject({
      title: '执行节点已关闭',
      tone: 'inactive',
    })
  })

  it('explains missing host installation without exposing raw systemd details', () => {
    const copy = processCopy({
      ...processState,
      controlAvailable: false,
      controlUnavailableReason: 'unit_not_found',
      enabledAtBoot: null,
      mainPid: null,
      status: 'unavailable',
      statusDetail: null,
    }, runtime)

    expect(copy.title).toBe('节点服务未安装')
    expect(copy.description).not.toContain('stderr')
  })

  it('keeps the real process copy while explaining missing control permission', () => {
    const restricted = {
      ...processState,
      controlAvailable: false,
      controlUnavailableReason: 'permission_denied' as const,
    }

    expect(processCopy(restricted, runtime).title).toBe('执行节点运行中')
    expect(unavailableControlCopy(restricted.controlUnavailableReason)).toEqual({
      hint: '需为 Web 服务授权固定启停命令',
      label: '权限不足',
    })
  })

  it('labels only persistent boot enablement as enabled', () => {
    expect(bootLabel(true)).toBe('随系统启动')
    expect(bootLabel(false)).toBe('未设为开机启动')
    expect(bootLabel(null)).toBe('启动策略未知')
  })
})

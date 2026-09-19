import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enqueueSecurityAudit: vi.fn(),
  ensureBusinessUser: vi.fn(),
  getSecurityWorkerProcessState: vi.fn(),
  getSecurityWorkerRuntime: vi.fn(),
  runSecurityWorkerProcessAction: vi.fn(),
  withBusinessTransaction: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/business', () => ({
  ensureBusinessUser: mocks.ensureBusinessUser,
  withBusinessTransaction: mocks.withBusinessTransaction,
}))
vi.mock('./audit-outbox', () => ({ enqueueSecurityAudit: mocks.enqueueSecurityAudit }))
vi.mock('./worker-process', () => ({
  getSecurityWorkerProcessState: mocks.getSecurityWorkerProcessState,
  runSecurityWorkerProcessAction: mocks.runSecurityWorkerProcessAction,
  SecurityWorkerProcessError: class SecurityWorkerProcessError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
      super(message)
    }
  },
}))
vi.mock('./worker-runtime', () => ({ getSecurityWorkerRuntime: mocks.getSecurityWorkerRuntime }))

const { requestSecurityWorkerControl } = await import('./worker-control')

const client = { query: vi.fn() }
const actor = { email: 'admin@hillm.ai', id: '00000000-0000-4000-8000-000000000001' }
const activeProcess = {
  controlAvailable: true,
  controlUnavailableReason: null,
  enabledAtBoot: true,
  mainPid: 2714,
  status: 'active',
  statusDetail: 'active',
  unit: 'hillm-security-worker.service',
}
const inactiveProcess = {
  controlAvailable: true,
  controlUnavailableReason: null,
  enabledAtBoot: false,
  mainPid: null,
  status: 'inactive',
  statusDetail: 'inactive',
  unit: 'hillm-security-worker.service',
}
const runtime = {
  acknowledgedWorkerCount: 0,
  executionMode: 'local_deterministic',
  incompatibleWorkerCount: 0,
  issues: [],
  lastSeenAt: null,
  queue: { inFlight: 0, oldestQueuedAt: null, queued: 3 },
  readySubjectTypes: [],
  requiredWorkerGeneration: 'generation-1',
  serviceAcknowledged: false,
  serviceEnabled: true,
  serviceStateChangedAt: '2026-09-12T00:00:00.000Z',
  serviceStateChangedBy: null,
  serviceStateVersion: 1,
  status: 'offline',
  workerCount: 0,
}

describe('security worker control service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withBusinessTransaction.mockImplementation(async callback => callback(client))
    mocks.getSecurityWorkerRuntime.mockResolvedValue(runtime)
    mocks.getSecurityWorkerProcessState.mockResolvedValue(inactiveProcess)
    mocks.runSecurityWorkerProcessAction.mockResolvedValue(activeProcess)
  })

  it('accepts a start request and records requested rather than completed', async () => {
    const result = await requestSecurityWorkerControl({ action: 'start', confirmInterrupt: false }, actor)

    expect(result).toMatchObject({ action: 'start', disposition: 'accepted', process: activeProcess })
    expect(mocks.runSecurityWorkerProcessAction).toHaveBeenCalledWith('start')
    expect(mocks.enqueueSecurityAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'security.worker.start_requested',
      code: 'SECURITY_WORKER_START_REQUESTED',
      success: true,
    }))
    expect(mocks.enqueueSecurityAudit.mock.calls[0]?.[1]?.action).not.toContain('completed')
  })

  it('returns noop without running systemctl when the target state is already durable', async () => {
    mocks.getSecurityWorkerProcessState.mockResolvedValue(activeProcess)

    const result = await requestSecurityWorkerControl({ action: 'start', confirmInterrupt: false }, actor)

    expect(result.disposition).toBe('noop')
    expect(mocks.runSecurityWorkerProcessAction).not.toHaveBeenCalled()
    expect(mocks.enqueueSecurityAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'security.worker.start_noop',
      success: true,
    }))
  })

  it('requires explicit confirmation before stopping active jobs', async () => {
    mocks.getSecurityWorkerProcessState.mockResolvedValue(activeProcess)
    mocks.getSecurityWorkerRuntime.mockResolvedValue({
      ...runtime,
      queue: { ...runtime.queue, inFlight: 2 },
      status: 'ready',
      workerCount: 1,
    })

    await expect(requestSecurityWorkerControl({ action: 'stop', confirmInterrupt: false }, actor)).rejects.toMatchObject({
      code: 'SECURITY_WORKER_ACTIVE_JOBS',
      status: 409,
    })
    expect(mocks.runSecurityWorkerProcessAction).not.toHaveBeenCalled()
    expect(mocks.enqueueSecurityAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'security.worker.stop_rejected',
      success: false,
    }))
  })

  it('stops after confirmation and keeps the queue snapshot in the response', async () => {
    const busyRuntime = {
      ...runtime,
      queue: { ...runtime.queue, inFlight: 1 },
      status: 'ready',
      workerCount: 1,
    }
    mocks.getSecurityWorkerProcessState.mockResolvedValue(activeProcess)
    mocks.getSecurityWorkerRuntime.mockResolvedValue(busyRuntime)
    mocks.runSecurityWorkerProcessAction.mockResolvedValue(inactiveProcess)

    const result = await requestSecurityWorkerControl({ action: 'stop', confirmInterrupt: true }, actor)

    expect(result).toMatchObject({
      action: 'stop',
      disposition: 'accepted',
      process: inactiveProcess,
      runtime: busyRuntime,
    })
    expect(mocks.runSecurityWorkerProcessAction).toHaveBeenCalledWith('stop')
  })
})

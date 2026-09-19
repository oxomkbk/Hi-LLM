import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  getSecurityWorkerControlSnapshot: vi.fn(),
  requestSecurityWorkerControl: vi.fn(),
  requireAdminSession: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/ai-security/http', () => ({
  readSecurityJsonBody: (request: Request) => request.json(),
  securityErrorResponse: (error: Error & { code?: string, status?: number }) => Response.json({
    code: 500,
    data: null,
    error: { code: error.code ?? 'SECURITY_REQUEST_FAILED' },
    msg: error.message,
  }, { status: error.status ?? 500 }),
  securitySuccess: (data: unknown, message = '请求成功', status = 200) => Response.json({
    code: 200,
    data,
    msg: message,
  }, { status }),
  SecurityHttpError: class SecurityHttpError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
      super(message)
    }
  },
}))
vi.mock('@/lib/ai-security/worker-control', () => ({
  getSecurityWorkerControlSnapshot: mocks.getSecurityWorkerControlSnapshot,
  requestSecurityWorkerControl: mocks.requestSecurityWorkerControl,
}))
vi.mock('@/lib/auth/session', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/security', () => ({ assertSameOrigin: mocks.assertSameOrigin }))

const { GET, POST } = await import('./route')

const snapshot = {
  process: {
    controlAvailable: true,
    controlUnavailableReason: null,
    enabledAtBoot: true,
    mainPid: 812,
    status: 'active',
    statusDetail: 'active',
    unit: 'hillm-security-worker.service',
  },
  runtime: { queue: { inFlight: 0 } },
}

describe('admin security worker route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ user: { id: 'admin' } })
    mocks.getSecurityWorkerControlSnapshot.mockResolvedValue(snapshot)
    mocks.requestSecurityWorkerControl.mockResolvedValue({
      ...snapshot,
      action: 'start',
      disposition: 'accepted',
    })
  })

  it('returns the real process and runtime state to an administrator', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/security-worker'))

    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual(snapshot)
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce()
  })

  it('accepts a same-origin fixed start action with HTTP 202', async () => {
    const response = await POST(controlRequest({ action: 'start' }))

    expect(response.status).toBe(202)
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce()
    expect(mocks.requestSecurityWorkerControl).toHaveBeenCalledWith({
      action: 'start',
      confirmInterrupt: false,
    }, { id: 'admin' })
  })

  it.each([
    {},
    { action: 'restart' },
    { action: 'stop', command: 'reboot' },
    { action: 'stop', confirmInterrupt: 'yes' },
  ])('rejects invalid control input without touching the worker service', async (body) => {
    const response = await POST(controlRequest(body))

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('SECURITY_REQUEST_INVALID')
    expect(mocks.requestSecurityWorkerControl).not.toHaveBeenCalled()
  })

  it('preserves active-job confirmation errors', async () => {
    mocks.requestSecurityWorkerControl.mockRejectedValue(Object.assign(
      new Error('当前有 2 个任务正在执行'),
      { code: 'SECURITY_WORKER_ACTIVE_JOBS', status: 409 },
    ))

    const response = await POST(controlRequest({ action: 'stop' }))

    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('SECURITY_WORKER_ACTIVE_JOBS')
  })

  it('rejects non-JSON control requests', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admin/security-worker', {
      body: 'action=start',
      headers: { 'content-type': 'text/plain', 'origin': 'http://localhost' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(mocks.requireAdminSession).not.toHaveBeenCalled()
    expect(mocks.requestSecurityWorkerControl).not.toHaveBeenCalled()
  })
})

function controlRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/security-worker', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'origin': 'http://localhost' },
    method: 'POST',
  })
}

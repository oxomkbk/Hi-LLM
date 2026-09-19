import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  checkSecuritySubjectSource: vi.fn(),
  requireAdminSession: vi.fn(),
}))

vi.mock('@/lib/ai-security/http', () => ({
  readSecurityJsonBody: (request: Request) => request.json(),
  securityErrorResponse: (error: Error & { code?: string, status?: number }) => Response.json({
    code: 500,
    data: null,
    error: { code: error.code ?? 'SOURCE_CHECK_FAILED' },
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
vi.mock('@/lib/ai-security/source-check', () => ({
  checkSecuritySubjectSource: mocks.checkSecuritySubjectSource,
}))
vi.mock('@/lib/ai-security/source-check-contract', () => ({
  SECURITY_SOURCE_CHECK_SUBJECT_TYPES: ['skill', 'skill_submission', 'mcp', 'mcp_submission'],
}))
vi.mock('@/lib/auth/session', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/security', () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  isUuid: (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}))

const { POST } = await import('./route')

const SUBJECT_ID = '00000000-0000-4000-8000-000000000001'
const RESULT = {
  archiveBytes: 512,
  canonicalUrl: 'https://github.com/acme/skills',
  checkedAt: '2026-09-01T00:00:00.000Z',
  fileCount: 2,
  projectPath: 'acme/skills',
  provider: 'github',
  ref: 'HEAD',
  sourceRevision: 'abcdef0123456789abcdef0123456789abcdef01',
  subdirectory: null,
  totalBytes: 128,
}

describe('admin security source checks route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ user: { id: 'admin' } })
    mocks.checkSecuritySubjectSource.mockResolvedValue(RESULT)
  })

  it('checks one managed subject after CSRF and administrator validation', async () => {
    const response = await POST(sourceRequest({ subjectId: SUBJECT_ID, subjectType: 'skill' }))

    expect(response.status).toBe(200)
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce()
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce()
    expect(mocks.checkSecuritySubjectSource).toHaveBeenCalledWith({
      subjectId: SUBJECT_ID,
      subjectType: 'skill',
    })
    expect((await response.json()).data).toEqual(RESULT)
  })

  it.each([
    [{ subjectId: 'not-a-uuid', subjectType: 'skill' }, 'malformed UUID'],
    [{ subjectId: SUBJECT_ID, subjectType: 'prompt' }, 'unsupported subject type'],
    [{ sourceUrl: 'https://github.com/evil/repo', subjectId: SUBJECT_ID, subjectType: 'skill' }, 'client-provided source URL'],
    [{ extra: true, subjectId: SUBJECT_ID, subjectType: 'skill' }, 'unknown body field'],
  ])('rejects %s before calling the source service (%s)', async (body, _description) => {
    const response = await POST(sourceRequest(body))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('SOURCE_CHECK_REQUEST_INVALID')
    expect(mocks.checkSecuritySubjectSource).not.toHaveBeenCalled()
  })

  it('preserves the stable source service error contract', async () => {
    mocks.checkSecuritySubjectSource.mockRejectedValue(serviceError(
      '仓库或指定分支/标签当前不可访问',
      409,
      'SOURCE_CHECK_REVISION_UNAVAILABLE',
    ))

    const response = await POST(sourceRequest({ subjectId: SUBJECT_ID, subjectType: 'skill' }))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('SOURCE_CHECK_REVISION_UNAVAILABLE')
  })

  it('does not call the service when same-origin validation fails', async () => {
    mocks.assertSameOrigin.mockImplementation(() => {
      throw serviceError('跨站请求已拒绝', 403, 'CSRF_REJECTED')
    })

    const response = await POST(sourceRequest({ subjectId: SUBJECT_ID, subjectType: 'skill' }))

    expect(response.status).toBe(403)
    expect(mocks.requireAdminSession).not.toHaveBeenCalled()
    expect(mocks.checkSecuritySubjectSource).not.toHaveBeenCalled()
  })

  it('does not call the service for a non-admin session', async () => {
    mocks.requireAdminSession.mockRejectedValue(serviceError('需要管理员权限', 403, 'FORBIDDEN'))

    const response = await POST(sourceRequest({ subjectId: SUBJECT_ID, subjectType: 'skill' }))

    expect(response.status).toBe(403)
    expect(mocks.checkSecuritySubjectSource).not.toHaveBeenCalled()
  })
})

function serviceError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { code, status })
}

function sourceRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/security-source-checks', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'origin': 'http://localhost' },
    method: 'POST',
  })
}

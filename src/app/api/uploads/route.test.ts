import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createUploadSession: vi.fn(),
  requireAdminSession: vi.fn(),
  requireSubmissionAccess: vi.fn(),
  requireUserSession: vi.fn(),
}))

vi.mock('@/lib/access-settings/service', () => ({
  requireSubmissionAccess: mocks.requireSubmissionAccess,
}))
vi.mock('@/lib/auth/session', () => ({
  requireAdminSession: mocks.requireAdminSession,
  requireUserSession: mocks.requireUserSession,
}))
vi.mock('@/lib/security', () => ({
  assertSameOrigin: mocks.assertSameOrigin,
}))
vi.mock('@/lib/uploads/service', () => ({
  createUploadSession: mocks.createUploadSession,
  UploadError: class UploadError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly code = 'UPLOAD_INVALID',
    ) {
      super(message)
    }
  },
}))
vi.mock('@/lib/uploads/scope', () => ({
  assertUploadScope: vi.fn(),
  assertUploadScopeFormat: (scope: string) => {
    if (!['community-prompt-asset', 'prompt-asset'].includes(scope))
      throw Object.assign(new Error('上传用途无效'), { code: 'UPLOAD_SCOPE_INVALID', status: 400 })
  },
  isAdminUploadScope: (scope: string) => scope === 'prompt-asset',
}))
vi.mock('@/lib/uploads/http', () => ({
  uploadErrorResponse: (error: Error & { code?: string, status?: number }) => Response.json({
    code: 500,
    data: null,
    error: { code: error.code ?? 'UPLOAD_REQUEST_FAILED' },
    msg: error.message,
  }, { status: error.status ?? 500 }),
}))
vi.mock('@/lib/utils', () => ({
  responseMessage: (data: unknown, msg = '请求成功') => ({ code: 200, data, msg }),
}))

const { POST } = await import('./route')

describe('upload session creation route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ user: { email: 'admin@example.com', id: 'admin-id', role: 'admin' } })
    mocks.requireUserSession.mockResolvedValue({ user: { email: 'user@example.com', id: 'user-id', role: 'user' } })
    mocks.createUploadSession.mockResolvedValue({ id: 'upload-id' })
  })

  it('uses an administrator session for administrator-owned upload scopes', async () => {
    const response = await POST(uploadRequest({ scope: 'prompt-asset' }))

    expect(response.status).toBe(201)
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce()
    expect(mocks.requireUserSession).not.toHaveBeenCalled()
    expect(mocks.createUploadSession).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ role: 'admin' }),
      scope: 'prompt-asset',
    }))
  })

  it('requires an explicit enabled scope instead of falling back to generic-file', async () => {
    const response = await POST(uploadRequest({}))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('UPLOAD_SCOPE_INVALID')
    expect(mocks.requireAdminSession).not.toHaveBeenCalled()
    expect(mocks.requireUserSession).not.toHaveBeenCalled()
    expect(mocks.createUploadSession).not.toHaveBeenCalled()
  })

  it('keeps feature-linked community uploads on the user session path', async () => {
    const response = await POST(uploadRequest({ scope: 'community-prompt-asset' }))

    expect(response.status).toBe(201)
    expect(mocks.requireSubmissionAccess).toHaveBeenCalledWith('prompt', expect.any(Headers))
    expect(mocks.requireUserSession).toHaveBeenCalledOnce()
    expect(mocks.requireAdminSession).not.toHaveBeenCalled()
    expect(mocks.createUploadSession).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ role: 'user' }),
      scope: 'community-prompt-asset',
    }))
  })
})

function uploadRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/uploads', {
    body: JSON.stringify({
      filename: 'asset.png',
      mimeType: 'image/png',
      size: 10,
      ...body,
    }),
    headers: { 'content-type': 'application/json', 'origin': 'http://localhost' },
    method: 'POST',
  })
}

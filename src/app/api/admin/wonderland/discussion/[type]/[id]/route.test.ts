import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  moderateWonderDiscussion: vi.fn(),
  requireAdminSession: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/security', () => ({ isUuid: vi.fn(() => true) }))
vi.mock('@/lib/wonderland/http', () => ({
  wonderlandErrorResponse: (error: Error & { code?: string, status?: number }) => Response.json({
    code: error.status ?? 500,
    data: null,
    error: { code: error.code ?? 'WONDERLAND_FAILED' },
    msg: error.message,
  }, { status: error.status ?? 500 }),
  wonderlandSuccess: (data: unknown, msg: string) => Response.json({ code: 200, data, msg }),
}))
vi.mock('@/lib/wonderland/services/admin', () => ({ moderateWonderDiscussion: mocks.moderateWonderDiscussion }))

const { PATCH } = await import('./route')

const id = '9476c415-584c-48dd-8f6d-4370562979d2'

describe('admin wonderland discussion route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ user: { id: 'admin' } })
    mocks.moderateWonderDiscussion.mockResolvedValue({ id })
  })

  it('allows administrators to soft delete answers', async () => {
    const response = await PATCH(request({ action: 'delete', reason: '后台删除回答' }), {
      params: Promise.resolve({ id, type: 'answer' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.moderateWonderDiscussion).toHaveBeenCalledWith({
      action: 'delete',
      actor: { id: 'admin' },
      id,
      reason: '后台删除回答',
      type: 'answer',
    })
  })

  it('does not widen the endpoint to delete comments', async () => {
    const response = await PATCH(request({ action: 'delete', reason: '后台删除评论' }), {
      params: Promise.resolve({ id, type: 'comment' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.moderateWonderDiscussion).not.toHaveBeenCalled()
  })
})

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/wonderland/discussion/answer/id', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
}

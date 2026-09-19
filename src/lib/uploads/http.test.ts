import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utils', () => ({
  RESPONSE: { ERROR: 500 },
  responseMessage: (data: unknown, msg: string, code: number, error?: unknown) => ({ data, msg, code, error }),
}))

const { uploadErrorResponse } = await import('./http')

describe('upload error response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not expose unknown server errors to clients', async () => {
    const response = uploadErrorResponse(Object.assign(new Error('relation upload_sessions does not exist'), { status: 500 }))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.msg).toBe('上传服务暂时不可用，请稍后再试')
    expect(JSON.stringify(payload)).not.toContain('upload_sessions')
  })
})

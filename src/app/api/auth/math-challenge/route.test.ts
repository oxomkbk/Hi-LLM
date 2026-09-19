import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createTrustedVisitorHash: vi.fn(() => 'f'.repeat(64)),
  issueMathCaptcha: vi.fn(),
}))

vi.mock('@/lib/auth/math-captcha', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/math-captcha')>()
  return { ...actual, issueMathCaptcha: mocks.issueMathCaptcha }
})
vi.mock('@/lib/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security')>()
  return {
    ...actual,
    assertSameOrigin: mocks.assertSameOrigin,
    createTrustedVisitorHash: mocks.createTrustedVisitorHash,
  }
})

const { POST } = await import('./route')
const { MathCaptchaRateLimitError } = await import('@/lib/auth/math-captcha')

describe('math captcha challenge route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createTrustedVisitorHash.mockReturnValue('f'.repeat(64))
  })

  it('issues a no-store challenge for a trusted visitor', async () => {
    mocks.issueMathCaptcha.mockResolvedValue({
      expiresAt: '2026-09-13T00:05:00.000Z',
      id: 'a'.repeat(32),
      question: '8 × 7 =',
    })

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(payload.data).toEqual({
      expiresAt: '2026-09-13T00:05:00.000Z',
      id: 'a'.repeat(32),
      question: '8 × 7 =',
    })
    expect(payload.data).not.toHaveProperty('answer')
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce()
    expect(mocks.createTrustedVisitorHash).toHaveBeenCalledWith(expect.any(NextRequest), 'math-captcha')
    expect(mocks.issueMathCaptcha).toHaveBeenCalledWith('f'.repeat(64))
  })

  it('returns a retryable rate limit with Retry-After', async () => {
    mocks.issueMathCaptcha.mockRejectedValue(new MathCaptchaRateLimitError(23))

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('23')
    expect(payload.error).toMatchObject({ code: 'MATH_CAPTCHA_RATE_LIMITED', retryable: true })
  })

  it('fails closed without leaking unexpected server errors', async () => {
    mocks.issueMathCaptcha.mockRejectedValue(new Error('database password leaked'))

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.msg).toBe('验证码服务暂时不可用，请稍后重试')
    expect(JSON.stringify(payload)).not.toContain('database password')
  })
})

function request() {
  return new NextRequest('http://localhost:3000/api/auth/math-challenge', {
    headers: { origin: 'http://localhost:3000' },
    method: 'POST',
  })
}

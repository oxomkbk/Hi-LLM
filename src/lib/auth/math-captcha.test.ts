import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withControlTransaction: vi.fn(),
}))

vi.mock('@/lib/db/control', () => ({
  withControlTransaction: mocks.withControlTransaction,
}))
vi.mock('@/lib/db/env', () => ({
  getAuthSecret: () => 'test-auth-secret-that-is-longer-than-32-bytes',
}))

const {
  createMathCaptchaDigest,
  createMathCaptchaProblem,
  issueMathCaptcha,
  MathCaptchaInvalidError,
  MathCaptchaRateLimitError,
  MathCaptchaUnavailableError,
  verifyMathCaptcha,
} = await import('./math-captcha')

const CHALLENGE_ID = 'a'.repeat(32)
const SECRET = 'test-auth-secret-that-is-longer-than-32-bytes'

describe('math captcha', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withControlTransaction.mockImplementation(async (callback: (client: { query: typeof mocks.query }) => Promise<unknown>) => callback({ query: mocks.query }))
  })

  it.each([
    { answer: 13, calls: [0, 5, 8], question: '5 + 8 =' },
    { answer: 3, calls: [1, 8, 5], question: '8 − 5 =' },
    { answer: 42, calls: [2, 6, 7], question: '6 × 7 =' },
    { answer: 7, calls: [3, 6, 7], question: '42 ÷ 6 =' },
  ])('creates a bounded $question problem', ({ answer, calls, question }) => {
    const randomInteger = vi.fn()
    for (const value of calls)
      randomInteger.mockReturnValueOnce(value)

    expect(createMathCaptchaProblem(randomInteger)).toEqual({ answer, question })
  })

  it('binds answer digests to each challenge id', () => {
    const first = createMathCaptchaDigest(SECRET, CHALLENGE_ID, 8)
    const second = createMathCaptchaDigest(SECRET, 'b'.repeat(32), 8)

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toBe(second)
    expect(first).not.toBe('8')
  })

  it('issues a challenge without exposing its answer', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const challenge = await issueMathCaptcha('f'.repeat(64))
    const verificationInsert = mocks.query.mock.calls.find(([sql]) => String(sql).includes('insert into auth.verification'))

    expect(challenge).toEqual({
      expiresAt: expect.any(String),
      id: expect.stringMatching(/^[\w-]{32}$/),
      question: expect.stringMatching(/^\d+ [+/−×÷] \d+ =$/),
    })
    expect(challenge).not.toHaveProperty('answer')
    expect(verificationInsert?.[1]?.[1]).toBe(`hillm-math-captcha:v1:${challenge.id}`)
    expect(verificationInsert?.[1]?.[2]).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects challenge issuance atomically after the visitor limit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_789_200_000_000)
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 20, lastRequest: String(Date.now() - 10_000) }] })

    await expect(issueMathCaptcha('f'.repeat(64))).rejects.toBeInstanceOf(MathCaptchaRateLimitError)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into auth.verification'))).toBe(false)
    vi.restoreAllMocks()
  })

  it('accepts a correct answer once using the captcha-only namespace', async () => {
    mocks.query.mockResolvedValue({
      rows: [{
        expiresAt: new Date(Date.now() + 60_000),
        value: createMathCaptchaDigest(SECRET, CHALLENGE_ID, 12),
      }],
    })

    await expect(verifyMathCaptcha({ answer: '12', id: CHALLENGE_ID })).resolves.toBeUndefined()
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('identifier like \'hillm-math-captcha:v1:%\''),
      [`hillm-math-captcha:v1:${CHALLENGE_ID}`],
    )
  })

  it('commits consumption before rejecting a wrong answer', async () => {
    let committed = false
    mocks.query.mockResolvedValue({
      rows: [{
        expiresAt: new Date(Date.now() + 60_000),
        value: createMathCaptchaDigest(SECRET, CHALLENGE_ID, 12),
      }],
    })
    mocks.withControlTransaction.mockImplementation(async (callback: (client: { query: typeof mocks.query }) => Promise<unknown>) => {
      const result = await callback({ query: mocks.query })
      committed = true
      return result
    })

    await expect(verifyMathCaptcha({ answer: '11', id: CHALLENGE_ID })).rejects.toBeInstanceOf(MathCaptchaInvalidError)
    expect(committed).toBe(true)
  })

  it('consumes and rejects expired challenges', async () => {
    let committed = false
    mocks.query.mockResolvedValue({
      rows: [{
        expiresAt: new Date(Date.now() - 1),
        value: createMathCaptchaDigest(SECRET, CHALLENGE_ID, 12),
      }],
    })
    mocks.withControlTransaction.mockImplementation(async (callback: (client: { query: typeof mocks.query }) => Promise<unknown>) => {
      const result = await callback({ query: mocks.query })
      committed = true
      return result
    })

    await expect(verifyMathCaptcha({ answer: '12', id: CHALLENGE_ID })).rejects.toBeInstanceOf(MathCaptchaInvalidError)
    expect(committed).toBe(true)
  })

  it('rejects missing or malformed headers before touching the database', async () => {
    await expect(verifyMathCaptcha({ answer: null, id: null })).rejects.toBeInstanceOf(MathCaptchaInvalidError)
    await expect(verifyMathCaptcha({ answer: '1 + 1', id: CHALLENGE_ID })).rejects.toBeInstanceOf(MathCaptchaInvalidError)
    await expect(verifyMathCaptcha({ answer: '2', id: 'reset-password:token' })).rejects.toBeInstanceOf(MathCaptchaInvalidError)
    expect(mocks.withControlTransaction).not.toHaveBeenCalled()
  })

  it('fails closed when the verification store is unavailable', async () => {
    mocks.withControlTransaction.mockRejectedValue(new Error('database unavailable'))

    await expect(verifyMathCaptcha({ answer: '12', id: CHALLENGE_ID })).rejects.toBeInstanceOf(MathCaptchaUnavailableError)
  })
})

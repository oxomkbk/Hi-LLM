import 'server-only'

import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'

import { withControlTransaction } from '@/lib/db/control'
import { getAuthSecret } from '@/lib/db/env'

const ANSWER_PATTERN = /^\d{1,3}$/
const CAPTCHA_EXPIRES_IN_MS = 5 * 60 * 1_000
const CAPTCHA_IDENTIFIER_PREFIX = 'hillm-math-captcha:v1:'
const CAPTCHA_RATE_LIMIT_MAX = 20
const CAPTCHA_RATE_LIMIT_WINDOW_MS = 60 * 1_000
const CHALLENGE_ID_PATTERN = /^[\w-]{32}$/
const VISITOR_HASH_PATTERN = /^[a-f0-9]{64}$/

export interface MathCaptchaChallenge {
  expiresAt: string
  id: string
  question: string
}

export interface MathCaptchaProblem {
  answer: number
  question: string
}

interface CaptchaVerificationRow {
  expiresAt: Date
  value: string
}

interface RateLimitRow {
  count: number
  lastRequest: string
}

export class MathCaptchaInvalidError extends Error {
  readonly code = 'MATH_CAPTCHA_INVALID'
  readonly status = 400

  constructor() {
    super('验证码错误或已失效，请重新计算')
  }
}

export class MathCaptchaRateLimitError extends Error {
  readonly code = 'MATH_CAPTCHA_RATE_LIMITED'
  readonly status = 429

  constructor(readonly retryAfter: number) {
    super('验证码刷新过于频繁，请稍后再试')
  }
}

export class MathCaptchaUnavailableError extends Error {
  readonly code = 'MATH_CAPTCHA_UNAVAILABLE'
  readonly status = 503

  constructor() {
    super('验证码服务暂时不可用，请稍后重试')
  }
}

export function createMathCaptchaDigest(secret: string, challengeId: string, answer: string | number) {
  return createHmac('sha256', secret)
    .update(`${CAPTCHA_IDENTIFIER_PREFIX}\0${challengeId}\0${String(answer)}`)
    .digest('hex')
}

export function createMathCaptchaProblem(randomInteger: typeof randomInt = randomInt): MathCaptchaProblem {
  const operation = randomInteger(0, 4)
  if (operation === 0) {
    const left = randomInteger(2, 50)
    const right = randomInteger(2, 50)
    return { answer: left + right, question: `${left} + ${right} =` }
  }
  if (operation === 1) {
    const left = randomInteger(2, 50)
    const right = randomInteger(1, left + 1)
    return { answer: left - right, question: `${left} − ${right} =` }
  }
  if (operation === 2) {
    const left = randomInteger(2, 10)
    const right = randomInteger(2, 10)
    return { answer: left * right, question: `${left} × ${right} =` }
  }
  const divisor = randomInteger(2, 10)
  const answer = randomInteger(2, 10)
  return { answer, question: `${divisor * answer} ÷ ${divisor} =` }
}

export async function issueMathCaptcha(visitorHash: string): Promise<MathCaptchaChallenge> {
  if (!VISITOR_HASH_PATTERN.test(visitorHash))
    throw new MathCaptchaUnavailableError()

  try {
    const now = Date.now()
    const expiresAt = new Date(now + CAPTCHA_EXPIRES_IN_MS)
    const challengeId = randomBytes(24).toString('base64url')
    const problem = createMathCaptchaProblem()
    const digest = createMathCaptchaDigest(getAuthSecret(), challengeId, problem.answer)
    const rateLimitKey = `hillm:math-captcha:${visitorHash}`

    await withControlTransaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [rateLimitKey])
      const rateResult = await client.query<RateLimitRow>(`
        select count, "lastRequest"::text as "lastRequest"
        from auth."rateLimit"
        where key = $1
        for update
      `, [rateLimitKey])
      const current = rateResult.rows[0]
      const windowStartedAt = Number(current?.lastRequest ?? 0)
      const inCurrentWindow = current && Number.isSafeInteger(windowStartedAt)
        && now - windowStartedAt < CAPTCHA_RATE_LIMIT_WINDOW_MS

      if (inCurrentWindow && current.count >= CAPTCHA_RATE_LIMIT_MAX) {
        const retryAfter = Math.max(1, Math.ceil((windowStartedAt + CAPTCHA_RATE_LIMIT_WINDOW_MS - now) / 1_000))
        throw new MathCaptchaRateLimitError(retryAfter)
      }

      if (current) {
        await client.query(`
          update auth."rateLimit"
          set count = $2, "lastRequest" = $3
          where key = $1
        `, [rateLimitKey, inCurrentWindow ? current.count + 1 : 1, inCurrentWindow ? windowStartedAt : now])
      }
      else {
        await client.query(`
          insert into auth."rateLimit" (id, key, count, "lastRequest")
          values ($1, $2, 1, $3)
        `, [randomUUID(), rateLimitKey, now])
      }

      await client.query(`
        delete from auth.verification
        where identifier like 'hillm-math-captcha:v1:%'
          and "expiresAt" <= now()
      `)
      await client.query(`
        insert into auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
        values ($1, $2, $3, $4, now(), now())
      `, [randomUUID(), captchaIdentifier(challengeId), digest, expiresAt])
    })

    return {
      expiresAt: expiresAt.toISOString(),
      id: challengeId,
      question: problem.question,
    }
  }
  catch (error) {
    if (error instanceof MathCaptchaRateLimitError)
      throw error
    throw new MathCaptchaUnavailableError()
  }
}

export async function verifyMathCaptcha(input: { answer: string | null, id: string | null }) {
  const challengeId = input.id?.trim() ?? ''
  const answer = input.answer?.trim() ?? ''
  if (!CHALLENGE_ID_PATTERN.test(challengeId) || !ANSWER_PATTERN.test(answer))
    throw new MathCaptchaInvalidError()

  let submittedDigest: string
  try {
    submittedDigest = createMathCaptchaDigest(getAuthSecret(), challengeId, answer)
  }
  catch {
    throw new MathCaptchaUnavailableError()
  }

  let consumed: CaptchaVerificationRow | null
  try {
    consumed = await withControlTransaction(async (client) => {
      const result = await client.query<CaptchaVerificationRow>(`
        delete from auth.verification
        where identifier = $1
          and identifier like 'hillm-math-captcha:v1:%'
        returning value, "expiresAt"
      `, [captchaIdentifier(challengeId)])
      return result.rows[0] ?? null
    })
  }
  catch {
    throw new MathCaptchaUnavailableError()
  }

  const valid = consumed
    && consumed.expiresAt.getTime() > Date.now()
    && digestMatches(consumed.value, submittedDigest)
  if (!valid)
    throw new MathCaptchaInvalidError()
}

function captchaIdentifier(challengeId: string) {
  return `${CAPTCHA_IDENTIFIER_PREFIX}${challengeId}`
}

function digestMatches(expected: string, actual: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual))
    return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
}

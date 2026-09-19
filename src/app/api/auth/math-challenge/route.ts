import { NextResponse } from 'next/server'

import {
  issueMathCaptcha,
  MathCaptchaRateLimitError,
  MathCaptchaUnavailableError,
} from '@/lib/auth/math-captcha'
import {
  assertSameOrigin,
  createTrustedVisitorHash,
  RequestOriginValidationError,
} from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const visitorHash = createTrustedVisitorHash(request, 'math-captcha')
    const challenge = await issueMathCaptcha(visitorHash)
    return NextResponse.json(responseMessage(challenge), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  catch (error) {
    const known = error instanceof MathCaptchaRateLimitError
      || error instanceof MathCaptchaUnavailableError
      || error instanceof RequestOriginValidationError
    const status = known ? error.status : 503
    const code = known && 'code' in error ? error.code : 'MATH_CAPTCHA_UNAVAILABLE'
    const message = known ? error.message : '验证码服务暂时不可用，请稍后重试'
    const headers: HeadersInit = { 'Cache-Control': 'no-store' }
    if (error instanceof MathCaptchaRateLimitError)
      headers['Retry-After'] = String(error.retryAfter)
    return NextResponse.json(
      responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 429 }),
      { headers, status },
    )
  }
}

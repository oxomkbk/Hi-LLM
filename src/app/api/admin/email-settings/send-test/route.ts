import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { EmailSettingsError, sendTestEmail } from '@/lib/email/settings'
import {
  EmailRecipientValidationError,
  EmailTestRequestValidationError,
  normalizeEmailTestRequest,
} from '@/lib/email/settings-validation'
import { PUBLIC_SERVER_ERROR_MESSAGE } from '@/lib/http/public-error'
import { assertSameOrigin } from '@/lib/security'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json')
      throw new EmailTestRequestValidationError('测试邮件请求必须使用 JSON', 415)

    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      readTestEmailRequest(request),
    ])
    return NextResponse.json(responseMessage(
      await sendTestEmail(input.recipient, session.user.id),
      '测试邮件已进入 SMTP 投递队列',
    ))
  }
  catch (error) {
    return testEmailErrorResponse(error)
  }
}

async function readTestEmailRequest(request: NextRequest) {
  try {
    return normalizeEmailTestRequest(await request.json())
  }
  catch (error) {
    if (error instanceof EmailRecipientValidationError || error instanceof EmailTestRequestValidationError)
      throw error
    throw new EmailTestRequestValidationError()
  }
}

function testEmailErrorResponse(error: unknown) {
  const known = error instanceof EmailSettingsError
    || error instanceof EmailRecipientValidationError
    || error instanceof EmailTestRequestValidationError
  const status = known
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
  const code = known
    ? error.code
    : safeStatus === 401
      ? 'AUTH_REQUIRED'
      : safeStatus === 403
        ? 'FORBIDDEN'
        : 'EMAIL_TEST_SEND_FAILED'
  const message = known || safeStatus < 500
    ? error instanceof Error ? error.message : '测试邮件发送失败'
    : PUBLIC_SERVER_ERROR_MESSAGE
  const retryable = error instanceof EmailSettingsError ? error.retryable : false

  return NextResponse.json(
    responseMessage(null, message, safeStatus, {
      code,
      retryable,
    }),
    { status: safeStatus },
  )
}

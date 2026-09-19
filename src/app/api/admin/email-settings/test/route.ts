import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { EmailSettingsError, testSavedEmailSettings } from '@/lib/email/settings'
import { PUBLIC_SERVER_ERROR_MESSAGE } from '@/lib/http/public-error'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const session = await requireSystemAdminSession(request.headers)
    return NextResponse.json(responseMessage(
      await testSavedEmailSettings(session.user.id),
      '邮件服务器连接正常',
    ))
  }
  catch (error) {
    const known = error instanceof EmailSettingsError
    const status = error instanceof EmailSettingsError
      ? error.status
      : typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 500
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
    return NextResponse.json(responseMessage(
      null,
      known || safeStatus < 500
        ? error instanceof Error ? error.message : '邮件服务器连接失败'
        : PUBLIC_SERVER_ERROR_MESSAGE,
      RESPONSE.ERROR,
      { code: known
        ? error.code
        : safeStatus === 401
          ? 'AUTH_REQUIRED'
          : safeStatus === 403
            ? 'FORBIDDEN'
            : 'EMAIL_CHECK_FAILED', retryable: safeStatus >= 500 },
    ), { status: safeStatus })
  }
}

import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { EmailSettingsError, getAdminEmailSettings, saveEmailSettings } from '@/lib/email/settings'
import { PUBLIC_SERVER_ERROR_MESSAGE } from '@/lib/http/public-error'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireSystemAdminSession(request.headers)
    return NextResponse.json(responseMessage(await getAdminEmailSettings()), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  catch (error) {
    return emailSettingsErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    return NextResponse.json(responseMessage(
      await saveEmailSettings(input, session.user.id),
      '邮件服务设置已保存',
    ))
  }
  catch (error) {
    return emailSettingsErrorResponse(error)
  }
}

function emailSettingsErrorResponse(error: unknown) {
  const known = error instanceof EmailSettingsError
  const status = known
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
  const message = known || safeStatus < 500
    ? error instanceof Error ? error.message : '邮件服务设置失败'
    : PUBLIC_SERVER_ERROR_MESSAGE
  const code = known
    ? error.code
    : safeStatus === 401
      ? 'AUTH_REQUIRED'
      : safeStatus === 403
        ? 'FORBIDDEN'
        : 'EMAIL_SETTINGS_FAILED'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: safeStatus >= 500 }),
    { status: safeStatus },
  )
}

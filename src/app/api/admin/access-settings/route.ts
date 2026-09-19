import { NextResponse } from 'next/server'

import {
  AccessSettingsError,
  getSiteAccessSettings,
  updateSiteAccessSettings,
} from '@/lib/access-settings/service'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const settings = await getSiteAccessSettings({ fresh: true })
    return NextResponse.json(responseMessage(settings), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  catch (error) {
    return accessSettingsErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const session = await requireAdminSession(request.headers)
    const input = await request.json() as Record<string, unknown>
    const settings = await updateSiteAccessSettings(input, session.user.id)
    return NextResponse.json(responseMessage(settings, '访问与发布设置已生效'))
  }
  catch (error) {
    return accessSettingsErrorResponse(error)
  }
}

function accessSettingsErrorResponse(error: unknown) {
  const known = error instanceof AccessSettingsError
  const status = known
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const code = known ? error.code : 'ACCESS_SETTINGS_FAILED'
  const message = known || status === 401 || status === 403
    ? (error as Error).message
    : '访问策略服务暂不可用'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { status },
  )
}

import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import {
  getSiteSecurityCenterState,
  SiteSecurityCenterError,
  updateSiteProtection,
} from '@/lib/site-security-center/service'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    return NextResponse.json(responseMessage(await getSiteSecurityCenterState(session.user.id)), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  catch (error) {
    return siteSecurityErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    const data = await updateSiteProtection({
      actor: {
        email: session.user.email,
        id: session.user.id,
        name: session.user.name,
      },
      enabled: input.enabled,
      key: input.key,
    })
    return NextResponse.json(responseMessage(data, '网站安全设置已生效'))
  }
  catch (error) {
    return siteSecurityErrorResponse(error)
  }
}

function siteSecurityErrorResponse(error: unknown) {
  const status = error instanceof SiteSecurityCenterError
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const code = error instanceof SiteSecurityCenterError ? error.code : 'SITE_SECURITY_CENTER_FAILED'
  const message = status === 401 || status === 403 || error instanceof SiteSecurityCenterError
    ? (error as Error).message
    : '网站安全中心暂时不可用'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { headers: { 'Cache-Control': 'private, no-store' }, status },
  )
}

import { NextResponse } from 'next/server'

import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import {
  getSecuritySettings,
  SecuritySettingsServiceError,
  updateSecuritySettings,
} from '@/lib/ai-security/settings-repository'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    return NextResponse.json(responseMessage({
      ...await getSecuritySettings(),
      capabilities: securityCapabilitiesForAdmin(session.user.id),
    }), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  catch (error) {
    return settingsErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    const settings = await updateSecuritySettings(input, {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
    })
    return NextResponse.json(responseMessage({
      ...settings,
      capabilities: securityCapabilitiesForAdmin(session.user.id),
    }, '安全评测策略已保存'))
  }
  catch (error) {
    return settingsErrorResponse(error)
  }
}

function settingsErrorResponse(error: unknown) {
  const known = error instanceof SecuritySettingsServiceError
  const status = known
    ? error.status
    : typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
  const code = known ? error.code : 'SECURITY_SETTINGS_FAILED'
  const message = known || status === 401 || status === 403
    ? (error as Error).message
    : '安全评测设置服务暂不可用'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { headers: { 'Cache-Control': 'private, no-store' }, status },
  )
}

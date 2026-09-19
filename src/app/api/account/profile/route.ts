import { NextResponse } from 'next/server'

import { updateAccountProfile } from '@/lib/account/service'
import { requireUserSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<unknown>,
    ])
    const data = await updateAccountProfile(session.user.id, input)
    return NextResponse.json(responseMessage(data, '个人资料已更新'))
  }
  catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
    const message = status >= 500 ? '个人资料暂时无法保存' : (error as Error).message
    return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
  }
}

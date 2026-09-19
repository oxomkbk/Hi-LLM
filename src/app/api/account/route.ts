import { NextResponse } from 'next/server'

import { getPrivateAccount } from '@/lib/account/service'
import { requireUserSession } from '@/lib/auth/session'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await requireUserSession(request.headers)
    return NextResponse.json(responseMessage(await getPrivateAccount(session.user.id)))
  }
  catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
    const message = status >= 500 ? '用户中心暂时无法加载' : (error as Error).message
    return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
  }
}

import { NextResponse } from 'next/server'

import { ProfileAppearanceError, updateProfileAppearance } from '@/lib/account/appearance-service'
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
    const data = await updateProfileAppearance(session.user.id, input)
    return NextResponse.json(responseMessage(data, '主页外观已更新'))
  }
  catch (error) {
    const status = error instanceof SyntaxError
      ? 400
      : typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 500
    const message = error instanceof SyntaxError
      ? '主页外观格式无效'
      : status >= 500
        ? '主页外观暂时无法保存'
        : (error as Error).message
    const code = error instanceof ProfileAppearanceError
      ? error.code
      : error instanceof SyntaxError
        ? 'PROFILE_APPEARANCE_INVALID_JSON'
        : 'PROFILE_APPEARANCE_SAVE_FAILED'
    return NextResponse.json(
      responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
      { status },
    )
  }
}

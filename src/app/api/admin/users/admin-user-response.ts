import { NextResponse } from 'next/server'

import { AdminUserError } from '@/lib/auth/admin-users'
import { RESPONSE, responseMessage } from '@/lib/utils'

export function adminUserErrorResponse(error: unknown) {
  const status = error instanceof AdminUserError
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const message = error instanceof Error ? error.message : '用户操作失败'
  return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
}

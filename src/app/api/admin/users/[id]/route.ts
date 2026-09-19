import { NextResponse } from 'next/server'

import { deleteAdminUser, updateAdminUser } from '@/lib/auth/admin-users'
import { requireSystemAdminSession } from '@/lib/auth/session'
import { responseMessage } from '@/lib/utils'

import { adminUserErrorResponse } from '../admin-user-response'

import type { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([
      context.params,
      requireSystemAdminSession(request.headers),
    ])
    const data = await deleteAdminUser(id, session.user.id)
    return NextResponse.json(responseMessage(data, '用户已删除'))
  }
  catch (error) {
    return adminUserErrorResponse(error)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, session, input] = await Promise.all([
      context.params,
      requireSystemAdminSession(request.headers),
      request.json() as Promise<unknown>,
    ])
    const data = await updateAdminUser(id, input, session.user.id)
    return NextResponse.json(responseMessage(data, '用户资料已更新'))
  }
  catch (error) {
    return adminUserErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'

import {
  AdminUserError,
  createAdminUser,
  listAdminUsers,
  parseAdminUserRole,
  parseAdminUserStatus,
} from '@/lib/auth/admin-users'
import { requireAdminSession, requireSystemAdminSession } from '@/lib/auth/session'
import { responseMessage } from '@/lib/utils'

import { adminUserErrorResponse } from './admin-user-response'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const pageIndex = parseInteger(params.get('pageIndex'), 0, 0, 100_000)
    const pageSize = parseInteger(params.get('pageSize'), 20, 1, 100)
    const q = (params.get('q') ?? '').trim().slice(0, 120)
    const data = await listAdminUsers({
      currentUserId: session.user.id,
      pageIndex,
      pageSize,
      q: q || undefined,
      role: parseAdminUserRole(params.get('role')),
      status: parseAdminUserStatus(params.get('status')),
    })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return adminUserErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<unknown>,
    ])
    const data = await createAdminUser(input, session.user.id)
    return NextResponse.json(responseMessage(data, '用户已创建'), { status: 201 })
  }
  catch (error) {
    return adminUserErrorResponse(error)
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new AdminUserError('分页参数无效')
  return parsed
}

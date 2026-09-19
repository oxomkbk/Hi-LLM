import { NextResponse } from 'next/server'

import { requireAdminSession, requireSystemAdminSession } from '@/lib/auth/session'
import {
  InfrastructureError,
  infrastructureOverview,
  switchInfrastructure,
} from '@/lib/infrastructure/service'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    return NextResponse.json(responseMessage(await infrastructureOverview()), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return infrastructureError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<{ databaseProfileId?: unknown, storageProfileId?: unknown }>,
    ])
    if (!isUuid(input.databaseProfileId) || !isUuid(input.storageProfileId))
      throw new InfrastructureError('请选择有效的数据库与存储配置')
    const data = await switchInfrastructure({
      databaseProfileId: input.databaseProfileId,
      storageProfileId: input.storageProfileId,
    }, session.user.id)
    return NextResponse.json(responseMessage(data, data.changed ? '基础设施连接已切换' : '当前已是所选配置'))
  }
  catch (error) {
    return infrastructureError(error)
  }
}

function infrastructureError(error: unknown) {
  const status = error instanceof InfrastructureError
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
}

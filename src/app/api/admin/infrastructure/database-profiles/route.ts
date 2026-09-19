import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { InfrastructureError, saveDatabaseProfile } from '@/lib/infrastructure/service'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { DatabaseProvider } from '@/lib/runtime/types'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<{
        connectionString?: unknown
        id?: unknown
        name?: unknown
        provider?: unknown
        rejectUnauthorized?: unknown
      }>,
    ])
    if (input.id !== undefined && !isUuid(input.id))
      throw new InfrastructureError('数据库配置编号无效')
    const data = await saveDatabaseProfile({
      connectionString: typeof input.connectionString === 'string' ? input.connectionString : '',
      id: input.id as string | undefined,
      name: typeof input.name === 'string' ? input.name : '',
      provider: input.provider as DatabaseProvider,
      rejectUnauthorized: input.rejectUnauthorized !== false,
    }, session.user.id)
    return NextResponse.json(responseMessage(data, input.id ? '数据库配置已更新' : '数据库配置已创建'), { status: input.id ? 200 : 201 })
  }
  catch (error) {
    return profileError(error, '数据库配置名称已存在')
  }
}

function profileError(error: unknown, duplicateMessage: string) {
  const duplicate = databaseErrorCode(error) === '23505'
  const status = duplicate
    ? 409
    : error instanceof InfrastructureError
      ? error.status
      : typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 400
  return NextResponse.json(responseMessage(null, duplicate ? duplicateMessage : (error as Error).message, RESPONSE.ERROR), { status })
}

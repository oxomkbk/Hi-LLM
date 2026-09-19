import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { InfrastructureError, saveStorageProfile } from '@/lib/infrastructure/service'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { StorageProviderType } from '@/lib/runtime/types'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    if (input.id !== undefined && !isUuid(input.id))
      throw new InfrastructureError('存储配置编号无效')
    const data = await saveStorageProfile({
      appId: readOptionalString(input.appId),
      bucket: readOptionalString(input.bucket),
      cdnDomain: readOptionalString(input.cdnDomain),
      id: input.id as string | undefined,
      name: readOptionalString(input.name) ?? '',
      provider: input.provider as StorageProviderType,
      region: readOptionalString(input.region),
      rootDirectory: readOptionalString(input.rootDirectory),
      secretId: readOptionalString(input.secretId),
      secretKey: readOptionalString(input.secretKey),
    }, session.user.id)
    return NextResponse.json(responseMessage(data, input.id ? '存储配置已更新' : '存储配置已创建'), { status: input.id ? 200 : 201 })
  }
  catch (error) {
    const duplicate = databaseErrorCode(error) === '23505'
    const status = duplicate
      ? 409
      : error instanceof InfrastructureError
        ? error.status
        : typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : 400
    return NextResponse.json(responseMessage(null, duplicate ? '存储配置名称已存在' : (error as Error).message, RESPONSE.ERROR), { status })
  }
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

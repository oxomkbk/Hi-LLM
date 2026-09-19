import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import {
  AdminFileError,
  listAdminFiles,
  parseAdminFileStatus,
} from '@/lib/files/admin-service'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { StorageProviderType } from '@/lib/runtime/types'
import type { NextRequest } from 'next/server'

const PROVIDERS = new Set<StorageProviderType>(['local-filesystem', 'tencent-cos'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const pageIndex = parseInteger(params.get('pageIndex'), 0, 0, 100_000)
    const pageSize = parseInteger(params.get('pageSize'), 20, 1, 100)
    const providerValue = params.get('provider')?.trim() || ''
    if (providerValue && !PROVIDERS.has(providerValue as StorageProviderType))
      throw new AdminFileError('存储类型筛选无效')
    const q = (params.get('q') ?? '').trim().slice(0, 120)
    const data = await listAdminFiles({
      pageIndex,
      pageSize,
      provider: providerValue ? providerValue as StorageProviderType : undefined,
      q: q || undefined,
      status: parseAdminFileStatus(params.get('status')),
    })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return adminFileErrorResponse(error)
  }
}

function adminFileErrorResponse(error: unknown) {
  const status = error instanceof AdminFileError
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const message = error instanceof Error ? error.message : '文件操作失败'
  return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new AdminFileError('分页参数无效')
  return parsed
}

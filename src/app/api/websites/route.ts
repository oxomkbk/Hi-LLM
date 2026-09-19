import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { catalogRepository } from '@/lib/repositories/catalog'
import { sanitizeWebsiteInput } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { WebsiteSaveParams } from '@/types'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const pageIndex = parseInteger(request.nextUrl.searchParams.get('pageIndex'), 0, 0, 10000)
    const pageSize = parseInteger(request.nextUrl.searchParams.get('pageSize'), 10, 1, 100)
    const result = await catalogRepository.listWebsites({
      categoryId: request.nextUrl.searchParams.get('category_id') || undefined,
      limit: pageSize,
      name: request.nextUrl.searchParams.get('name')?.trim() || undefined,
      offset: pageIndex * pageSize,
    })
    return NextResponse.json(responseMessage({ ...result, page: pageIndex + 1, pageSize }))
  }
  catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    const input = sanitizeWebsiteInput(await request.json(), true) as WebsiteSaveParams
    const data = await catalogRepository.createWebsite({ ...input, logo: null }, session.user)
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      return NextResponse.json(responseMessage(null, '网站名称或链接已存在！', RESPONSE.ERROR), { status: 409 })
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 400
  return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('参数错误')
  return parsed
}

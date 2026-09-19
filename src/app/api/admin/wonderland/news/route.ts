import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { findAdminWonderNews, listAdminWonderNews } from '@/lib/wonderland/repositories/admin'
import { deleteWonderNews, readNewsStatus, saveWonderNews } from '@/lib/wonderland/services/admin'
import { sanitizeNewsInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    const id = request.nextUrl.searchParams.get('id')
    if (!isUuid(id))
      throw new WonderlandError('新闻编号无效', 400, 'NEWS_ID_INVALID')
    return wonderlandSuccess(await deleteWonderNews(session.user, id), '新闻已删除')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      if (!isUuid(id))
        throw new WonderlandError('新闻编号无效', 400, 'NEWS_ID_INVALID')
      const article = await findAdminWonderNews(id)
      if (!article)
        throw new WonderlandError('新闻不存在', 404, 'NEWS_NOT_FOUND')
      return wonderlandSuccess(article)
    }
    const pageIndex = readInteger(request.nextUrl.searchParams.get('pageIndex'), 0, 0, 10000)
    const pageSize = readInteger(request.nextUrl.searchParams.get('pageSize'), 20, 1, 100)
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100) || undefined
    const status = readNewsStatus(request.nextUrl.searchParams.get('status'))
    const result = await listAdminWonderNews({ limit: pageSize, offset: pageIndex * pageSize, q, status })
    return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    return wonderlandSuccess(await saveWonderNews({ actor: session.user, news: sanitizeNewsInput(body) }), '新闻已创建', 201)
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    if (!isUuid(body.id))
      throw new WonderlandError('新闻编号无效', 400, 'NEWS_ID_INVALID')
    return wonderlandSuccess(await saveWonderNews({
      actor: session.user,
      expectedUpdatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
      id: body.id,
      news: sanitizeNewsInput(body),
    }), '新闻已更新')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

function readInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null || value === '' ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new WonderlandError('分页参数无效', 400, 'PAGINATION_INVALID')
  return parsed
}

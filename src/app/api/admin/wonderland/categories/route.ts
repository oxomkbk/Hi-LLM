import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { getAdminWonderCategories } from '@/lib/wonderland/repositories/admin'
import { deleteWonderCategory, saveWonderCategory } from '@/lib/wonderland/services/admin'
import { sanitizeCategoryInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    const id = request.nextUrl.searchParams.get('id')
    if (!isUuid(id))
      throw new WonderlandError('分类编号无效', 400, 'CATEGORY_ID_INVALID')
    return wonderlandSuccess(await deleteWonderCategory(session.user, id), '分类已删除')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    return wonderlandSuccess(await getAdminWonderCategories())
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    return wonderlandSuccess(await saveWonderCategory({ actor: session.user, category: sanitizeCategoryInput(body) }), '分类已创建', 201)
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    if (!isUuid(body.id))
      throw new WonderlandError('分类编号无效', 400, 'CATEGORY_ID_INVALID')
    return wonderlandSuccess(await saveWonderCategory({ actor: session.user, category: sanitizeCategoryInput(body), id: body.id }), '分类已更新')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

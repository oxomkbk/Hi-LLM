import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { findAdminWonderQuestion, getAdminWonderTags, listAdminWonderDiscussion, listAdminWonderQuestions } from '@/lib/wonderland/repositories/admin'
import { saveWonderQuestion } from '@/lib/wonderland/services/admin'
import { sanitizeQuestionInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      if (!isUuid(id))
        throw new WonderlandError('问题编号无效', 400, 'QUESTION_ID_INVALID')
      const question = await findAdminWonderQuestion(id)
      if (!question)
        throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
      return wonderlandSuccess(question)
    }
    if (request.nextUrl.searchParams.get('meta') === 'tags')
      return wonderlandSuccess(await getAdminWonderTags())
    const pageIndex = Math.max(0, Number(request.nextUrl.searchParams.get('pageIndex') || 0))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20)))
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100) || undefined
    const rawVisibility = request.nextUrl.searchParams.get('visibility')
    const visibility = rawVisibility === 'visible' || rawVisibility === 'hidden' || rawVisibility === 'deleted' ? rawVisibility : undefined
    const type = request.nextUrl.searchParams.get('type')
    if (type === 'answer') {
      const result = await listAdminWonderDiscussion({ limit: pageSize, offset: pageIndex * pageSize, q, type, visibility })
      return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
    }
    const result = await listAdminWonderQuestions({ limit: pageSize, offset: pageIndex * pageSize, q, visibility })
    return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    return wonderlandSuccess(await saveWonderQuestion({ actor: session.user, question: sanitizeQuestionInput(body) }), '问题已创建', 201)
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>])
    if (!isUuid(body.id))
      throw new WonderlandError('问题编号无效', 400, 'QUESTION_ID_INVALID')
    return wonderlandSuccess(await saveWonderQuestion({ actor: session.user, id: body.id, question: sanitizeQuestionInput(body) }), '问题已更新')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

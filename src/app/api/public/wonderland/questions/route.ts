import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'
import { WONDER_QUESTION_SORTS } from '@/lib/wonderland/domain'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { listPublicQuestionPage } from '@/lib/wonderland/repositories/community'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const limit = parseLimit(params.get('limit'))
    const state = params.get('state')
    const sort = params.get('sort') || 'newest'
    if (state && state !== 'open' && state !== 'resolved' && state !== 'closed')
      return NextResponse.json(responseMessage(null, '问题状态无效', RESPONSE.ERROR), { status: 400 })
    if (!(WONDER_QUESTION_SORTS as readonly string[]).includes(sort))
      return NextResponse.json(responseMessage(null, '排序方式无效', RESPONSE.ERROR), { status: 400 })
    const page = await listPublicQuestionPage({
      categorySlug: params.get('category')?.trim().slice(0, 80) || undefined,
      limit,
      page: parsePage(params.get('page')),
      q: params.get('q')?.trim().slice(0, 100) || undefined,
      state: state as 'closed' | 'open' | 'resolved' | undefined,
      sort: sort as import('@/lib/wonderland/domain').WonderQuestionSort,
      tagSlug: params.get('tag')?.trim().slice(0, 80) || undefined,
    })
    const response = wonderlandSuccess(page)
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
    return response
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

function parseLimit(value: string | null) {
  const parsed = Number(value ?? 20)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 20
}

function parsePage(value: string | null) {
  const parsed = Number(value ?? 1)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1
}

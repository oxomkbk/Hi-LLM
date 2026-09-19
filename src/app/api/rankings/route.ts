import { NextResponse } from 'next/server'

import { publicServerError } from '@/lib/http/public-error'
import { isRankingPeriod } from '@/lib/rankings'
import { catalogRepository } from '@/lib/repositories/catalog'
import { RESPONSE, responseMessage } from '@/lib/utils'
import { isUuid } from '@/lib/uuid'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const requestedPeriod = request.nextUrl.searchParams.get('period') ?? 'all'
    const categoryId = request.nextUrl.searchParams.get('category')?.trim() || undefined

    if (!isRankingPeriod(requestedPeriod))
      return NextResponse.json(responseMessage(null, '统计周期无效', RESPONSE.ERROR), { status: 400 })

    if (categoryId && !isUuid(categoryId))
      return NextResponse.json(responseMessage(null, '排行榜分类无效', RESPONSE.ERROR), { status: 400 })

    return NextResponse.json(responseMessage(await catalogRepository.rankings({
      categoryId,
      period: requestedPeriod,
    })), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  }
  catch (error) {
    const failure = publicServerError(error, '公开排行榜加载失败')
    return NextResponse.json(responseMessage(null, failure.message, RESPONSE.ERROR, {
      code: failure.code,
      retryable: failure.retryable,
    }), { status: failure.status })
  }
}

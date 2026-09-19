import { NextResponse } from 'next/server'

import { publicServerError } from '@/lib/http/public-error'
import { catalogRepository } from '@/lib/repositories/catalog'
import { RESPONSE, responseMessage } from '@/lib/utils'

export async function GET() {
  try {
    return NextResponse.json(responseMessage(await catalogRepository.listCategoryOptions()), {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }
  catch (error) {
    const failure = publicServerError(error, '公开分类加载失败')
    return NextResponse.json(responseMessage(null, failure.message, RESPONSE.ERROR, {
      code: failure.code,
      retryable: failure.retryable,
    }), { status: failure.status })
  }
}

import { NextResponse } from 'next/server'

import { publicServerError } from '@/lib/http/public-error'
import { catalogRepository } from '@/lib/repositories/catalog'
import { RESPONSE, responseMessage } from '@/lib/utils'

export async function GET() {
  try {
    const list = await catalogRepository.listPublicCatalog()
    return NextResponse.json(responseMessage({
      list,
      page: 1,
      pageSize: list.length,
      total: list.length,
    }))
  }
  catch (error) {
    const failure = publicServerError(error, '公开目录加载失败')
    return NextResponse.json(responseMessage(null, failure.message, RESPONSE.ERROR, {
      code: failure.code,
      retryable: failure.retryable,
    }), { status: failure.status })
  }
}

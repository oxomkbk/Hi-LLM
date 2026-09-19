import { NextResponse } from 'next/server'

import { publicServerError } from '@/lib/http/public-error'
import { catalogRepository } from '@/lib/repositories/catalog'
import { assertSameOrigin, createTrustedVisitorHash, isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const { id } = await params
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '网站参数无效', RESPONSE.ERROR), { status: 400 })
    const counted = await catalogRepository.recordVisit(id, createTrustedVisitorHash(request, 'visit'))
    return NextResponse.json(responseMessage({ counted }))
  }
  catch (error) {
    if (databaseErrorCode(error) === '23503')
      return NextResponse.json(responseMessage(null, '网站不存在', RESPONSE.ERROR), { status: 404 })
    if (error instanceof Error && error.message === '请求来源校验失败')
      return NextResponse.json(responseMessage(null, error.message, RESPONSE.ERROR), { status: 403 })
    const failure = publicServerError(error, '网站访问记录失败')
    return NextResponse.json(responseMessage(null, failure.message, RESPONSE.ERROR, {
      code: failure.code,
      retryable: failure.retryable,
    }), { status: failure.status })
  }
}

function databaseErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined
}

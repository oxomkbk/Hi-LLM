import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'

export function promptErrorResponse(error: unknown, fallback = 'Prompts 操作失败') {
  const candidate = typeof error === 'object' && error ? error as Record<string, unknown> : {}
  const code = typeof candidate.code === 'string' ? candidate.code : 'PROMPT_REQUEST_FAILED'
  const explicit = Number(candidate.status)
  const status = Number.isInteger(explicit) && explicit >= 400 && explicit <= 599 ? explicit : 400
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR, { code, retryable: false }), { status })
}

export function promptSuccess<T>(data: T, message = '请求成功', status = 200, headers?: HeadersInit) {
  return NextResponse.json(responseMessage(data, message), { headers, status })
}

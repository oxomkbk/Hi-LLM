import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'

export function uploadErrorResponse(error: unknown) {
  const candidate = typeof error === 'object' && error ? error as Record<string, unknown> : {}
  const hasExplicitStatus = Number.isSafeInteger(Number(candidate.status))
  const status = safeStatus(candidate.status, error)
  const internal = status >= 500 || !hasExplicitStatus
  const message = internal
    ? '上传服务暂时不可用，请稍后再试'
    : error instanceof Error ? error.message : '上传请求失败'
  let code = internal ? 'UPLOAD_INTERNAL_ERROR' : 'UPLOAD_REQUEST_FAILED'
  if (!internal && typeof candidate.code === 'string' && candidate.code)
    code = candidate.code
  else if (status === 401)
    code = 'AUTH_REQUIRED'
  else if (status === 403)
    code = 'UPLOAD_FORBIDDEN'
  const retryable = candidate.retryable === true

  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable }),
    { status },
  )
}

function safeStatus(value: unknown, error: unknown) {
  const status = Number(value)
  if (Number.isSafeInteger(status) && status >= 400 && status <= 599)
    return status
  if (error instanceof Error && error.message === '请求来源校验失败')
    return 403
  return error instanceof SyntaxError ? 400 : 500
}

import { Buffer } from 'node:buffer'

import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'

import { AiSecurityError } from './errors'
import { AssessmentQueueError } from './queue'

const MAX_BODY_BYTES = 64 * 1024

export class SecurityHttpError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function readSecurityJsonBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY_BYTES)
    throw new SecurityHttpError('请求正文过大', 413, 'SECURITY_REQUEST_INVALID')
  const serialized = await request.text()
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES)
    throw new SecurityHttpError('请求正文过大', 413, 'SECURITY_REQUEST_INVALID')
  try {
    const value = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected object')
    return value as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof SecurityHttpError)
      throw error
    throw new SecurityHttpError('请求正文格式无效', 400, 'SECURITY_REQUEST_INVALID')
  }
}

export function securityErrorResponse(error: unknown, fallback = '安全评测操作失败') {
  const candidate = typeof error === 'object' && error ? error as Record<string, unknown> : {}
  const typedServiceError = Number.isInteger(Number(candidate.status))
    && typeof candidate.code === 'string'
    && error instanceof Error
  const known = error instanceof SecurityHttpError || error instanceof AssessmentQueueError || typedServiceError
  const status = error instanceof SecurityHttpError || error instanceof AssessmentQueueError
    ? error.status
    : typedServiceError
      ? Number(candidate.status)
      : typeof error === 'object' && error && 'status' in error && Number.isInteger(Number(error.status))
        ? Number(error.status)
        : error instanceof AiSecurityError ? 409 : 500
  const code = typeof candidate.code === 'string' ? candidate.code : 'SECURITY_REQUEST_FAILED'
  const message = known || error instanceof AiSecurityError || status === 401 || status === 403
    ? (error as Error).message
    : fallback
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { headers: { 'Cache-Control': 'private, no-store' }, status },
  )
}

export function securitySuccess<T>(data: T, message = '请求成功', status = 200) {
  return NextResponse.json(responseMessage(data, message), {
    headers: { 'Cache-Control': 'private, no-store' },
    status,
  })
}

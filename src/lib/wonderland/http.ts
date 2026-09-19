import { NextResponse } from 'next/server'

import { responseMessage } from '../utils'
import { isWonderlandError } from './errors'

export function wonderlandErrorResponse(error: unknown) {
  const databaseError = databaseConstraintError(error)
  const status = isWonderlandError(error)
    ? error.status
    : databaseError
      ? databaseError.status
      : typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 500
  const code = isWonderlandError(error)
    ? error.code
    : databaseError?.code
      ?? (typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : status === 401
          ? 'AUTH_REQUIRED'
          : status === 403
            ? 'AUTH_FORBIDDEN'
            : 'WONDERLAND_INTERNAL_ERROR')
  const message = status >= 500
    ? '妙妙屋暂时无法处理请求，请稍后重试'
    : databaseError?.message ?? (error as Error).message
  if (status >= 500 || databaseError)
    console.error('妙妙屋请求失败', safeError(error))
  return NextResponse.json({
    ...responseMessage(null, message, status),
    error: { code, retryable: status >= 500 },
  }, { status })
}

export function wonderlandSuccess(data: unknown, message = '请求成功', status = 200) {
  return NextResponse.json(responseMessage(data, message), { status })
}

function databaseConstraintError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error))
    return null
  const code = String(error.code)
  if (code === '23505')
    return { code: 'WONDERLAND_CONFLICT', message: '数据已存在，请修改后重试', status: 409 }
  if (code === '23503')
    return { code: 'WONDERLAND_IN_USE', message: '数据仍被其他内容使用，无法删除', status: 409 }
  if (code === '23502' || code === '23514')
    return { code: 'WONDERLAND_CONSTRAINT', message: '数据不符合系统约束', status: 400 }
  if (code === '40001' || code === '40P01')
    return { code: 'WONDERLAND_CONCURRENT_WRITE', message: '数据正在更新，请重试', status: 409 }
  return null
}

function safeError(error: unknown) {
  if (!error || typeof error !== 'object')
    return { type: typeof error }

  return {
    code: 'code' in error ? String(error.code) : undefined,
    constraint: 'constraint' in error ? String(error.constraint) : undefined,
    message: error instanceof Error ? error.message : undefined,
    name: error instanceof Error ? error.name : undefined,
    table: 'table' in error ? String(error.table) : undefined,
  }
}

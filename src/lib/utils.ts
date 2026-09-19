import type { ApiErrorPayload, IResponse } from '@/types'

/**
 * @description: 请求状态
 */
export const RESPONSE = {
  SUCCESS: 200,
  ERROR: 500,
} as const

/**
 * @description: 格式化时间
 */
export function formatDate(value: string | number | Date, type: 'date' | 'datetime' = 'date') {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(type === 'datetime'
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      : {}),
  })
    .format(date)
    .replace(/\//g, '-')
}

// 新文件使用稳定的应用内地址，底层可由本地文件或私有 COS 提供。
export function generateLogoUrl(value: string) {
  if (/^(?:https?:|data:|blob:)/i.test(value))
    return value
  if (value.startsWith('file:'))
    return `/api/files/${encodeURIComponent(value.slice(5))}`

  const legacyBase = process.env.NEXT_PUBLIC_LEGACY_STORAGE_PUBLIC_URL?.replace(/\/$/, '')
  return legacyBase ? `${legacyBase}/${value.replace(/^\//, '')}` : value
}

/**
 * Dynamically get a nested value from an array or
 * object with a string.
 *
 * @example get(person, 'friends[0].name')
 */
export function get<TDefault = unknown>(value: unknown, path: string, defaultValue?: TDefault): TDefault {
  const segments = path.split(/[.[\]]/g)
  let current: any = value
  for (const key of segments) {
    if (current === null)
      return defaultValue as TDefault
    if (current === undefined)
      return defaultValue as TDefault
    const dequoted = key.replace(/['"]/g, '')
    if (dequoted.trim() === '')
      continue
    current = current[dequoted]
  }
  if (current === undefined)
    return defaultValue as TDefault
  return current
}

/**
 * @description: 统一返回体
 */
export function responseMessage<T = unknown>(
  data: T,
  msg: string = '请求成功',
  code: number = RESPONSE.SUCCESS,
  error?: ApiErrorPayload,
): IResponse<T> {
  return { data, msg, code, timestamp: Date.now(), ...(error ? { error } : {}) }
}

/**
 * HTML time attributes must be stable between the server and browser. The
 * PostgreSQL driver may return either Date objects or strings depending on
 * the runtime, so always serialize them explicitly.
 */
export function toIsoDateTime(value: string | number | Date) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

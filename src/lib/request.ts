import { toast } from '@heroui/react'

import type { IResponse } from '@/types'

interface RequestOptions extends RequestInit {
  params?: Record<string, unknown>
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code = 'REQUEST_FAILED',
    readonly retryable = false,
    readonly notified = false,
  ) {
    super(message)
  }
}

const BASE_URL = '/api'
const inFlightGetRequests = new Map<string, Promise<IResponse<unknown>>>()

export function notifyRequestFailure(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiRequestError) {
    if (!error.notified)
      toast.danger(error.message || fallbackMessage)
    return
  }
  toast.danger(fallbackMessage)
}

export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<IResponse<T>> {
  const {
    params,
    ...fetchOptions
  } = options

  const headers = new Headers(
    fetchOptions.headers,
  )

  // 只有非 FormData 才设置 JSON
  if (
    !(fetchOptions.body instanceof FormData)
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  const requestUrl = buildUrl(url, params)
  const method = String(fetchOptions.method ?? 'GET').toUpperCase()
  const execute = () => executeRequest<T>(requestUrl, { ...fetchOptions, headers })

  if (method !== 'GET' || fetchOptions.signal)
    return execute()

  const existing = inFlightGetRequests.get(requestUrl)
  if (existing)
    return existing as Promise<IResponse<T>>

  const pending = execute()
  inFlightGetRequests.set(requestUrl, pending as Promise<IResponse<unknown>>)
  const release = () => {
    if (inFlightGetRequests.get(requestUrl) === pending)
      inFlightGetRequests.delete(requestUrl)
  }
  void pending.then(release, release)
  return pending
}

function buildUrl(
  url: string,
  params?: Record<string, unknown>,
) {
  if (!params) {
    return `${BASE_URL}${url}`
  }

  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(
        key,
        String(value),
      )
    }
  })

  const query = searchParams.toString()
  return query ? `${BASE_URL}${url}?${query}` : `${BASE_URL}${url}`
}

async function executeRequest<T>(requestUrl: string, options: RequestInit): Promise<IResponse<T>> {
  const response = await fetch(requestUrl, options)

  if (!response.ok) {
    const result = await response.json().catch(() => null) as IResponse<T> | null
    const msg = result?.msg || `请求失败 ${response.status}`
    toast.danger(msg)
    throw new ApiRequestError(
      msg,
      response.status,
      result?.error?.code,
      result?.error?.retryable,
      true,
    )
  }

  const result = await response.json() as IResponse<T>

  if (result.code !== 200) {
    const msg = result.msg || '请求失败'
    toast.danger(msg)
  }

  return result
}

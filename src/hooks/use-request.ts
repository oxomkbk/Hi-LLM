import { useProgress } from '@bprogress/next'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  request,
} from '@/lib/request'

import type { IResponse } from '@/types'

type RequestPayload = Record<string, unknown> | FormData

interface RunFunction<T> {
  (
    data?: RequestPayload,
  ): Promise<IResponse<T>>

  (
    id: string | number,
    data?: RequestPayload,
  ): Promise<IResponse<T>>
}

interface UseRequestOptions<T> {

  method?:
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'

  params?: Record<string, unknown>

  manual?: boolean

  /** 是否为接口请求显示全局进度条；后台默认使用模块内加载状态。 */
  progress?: boolean

  onSuccess?: (
    result: IResponse<T>,
  ) => void

  onError?: (
    error: unknown,
  ) => void

  onFinally?: () => void
}

export default function useRequest<
  T = unknown,
>(
  url: string,
  options: UseRequestOptions<T> = {},
) {
  const {
    method = 'GET',
    params: defaultParams,
    manual = false,
    progress,
    onSuccess,
    onError,
    onFinally,
  } = options
  const pathname = usePathname()
  const showGlobalProgress = progress ?? !pathname.startsWith('/admin')
  const { start, stop } = useProgress()
  const defaultParamsRef = useRef(defaultParams)
  const callbacksRef = useRef({ onError, onFinally, onSuccess })
  const progressRef = useRef({ start, stop })
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const [data, setData]
    = useState<T>()

  const [loading, setLoading]
    = useState(false)

  const [error, setError]
    = useState<unknown>()

  useEffect(() => {
    defaultParamsRef.current = defaultParams
  }, [defaultParams])

  useEffect(() => {
    callbacksRef.current = { onError, onFinally, onSuccess }
  }, [onError, onFinally, onSuccess])

  useEffect(() => {
    progressRef.current = { start, stop }
  }, [start, stop])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(
    (async (
      idOrData?: string | number | RequestPayload,
      body?: RequestPayload,
    ) => {
      const requestId = method === 'GET' ? ++requestIdRef.current : 0
      const isLatestRequest = () => method !== 'GET' || requestId === requestIdRef.current
      const canCommit = () => mountedRef.current && isLatestRequest()

      try {
        if (showGlobalProgress)
          progressRef.current.start()

        if (canCommit()) {
          setLoading(true)

          setError(undefined)
        }

        let requestUrl = url

        let params:
          Record<string, unknown>
          | undefined

        let requestBody: RequestPayload | undefined

        switch (method) {
          case 'GET':

            params = {
              ...defaultParamsRef.current,
              ...(idOrData as Record<string, unknown> | undefined),
            }

            if (!Object.keys(params).length) {
              params = undefined
            }

            break

          case 'POST':
            if (url.includes(':id') && (typeof idOrData === 'string' || typeof idOrData === 'number')) {
              requestUrl = url.replace(':id', String(idOrData))
              requestBody = body
            }
            else {
              requestBody = idOrData as RequestPayload
            }

            break

          case 'PUT':

            requestUrl
              = url.includes(':id')
                ? url.replace(':id', String(idOrData))
                : `${url}/${idOrData}`

            requestBody
              = body

            break

          case 'DELETE':

            requestUrl
              = `${url}/${idOrData}`

            break
        }

        const result
          = await request<T>(
            requestUrl,
            {
              method,
              params,
              body:
                requestBody instanceof FormData
                  ? requestBody
                  : requestBody
                    ? JSON.stringify(requestBody)
                    : undefined,
            },
          )

        if (canCommit()) {
          setData(result.data)

          callbacksRef.current.onSuccess?.(
            result,
          )
        }

        return result
      }
      catch (err) {
        if (canCommit()) {
          setError(err)

          callbacksRef.current.onError?.(err)
        }

        throw err
      }
      finally {
        if (isLatestRequest()) {
          if (showGlobalProgress)
            progressRef.current.stop()

          if (mountedRef.current) {
            setLoading(false)

            callbacksRef.current.onFinally?.()
          }
        }
      }
    }) as RunFunction<T>,
    [
      url,
      method,
      showGlobalProgress,
    ],
  )

  useEffect(() => {
    if (!manual) {
      run().catch(() => {})
    }
  }, [
    manual,
    run,
  ])

  return {
    data,
    loading,
    error,
    run,
  }
}

import type { LlmProtocol } from '@/types'

export function buildLlmEndpoint(baseUrl: string, protocol: LlmProtocol) {
  const url = new URL(baseUrl)
  const pathname = url.pathname.replace(/\/+$/, '')
  const endpoint = protocol === 'openai' ? 'chat/completions' : 'messages'

  if (pathname.endsWith(`/${endpoint}`))
    return url.toString()

  url.pathname = pathname === '' || pathname === '/'
    ? `/v1/${endpoint}`
    : `${pathname}/${endpoint}`
  return url.toString()
}

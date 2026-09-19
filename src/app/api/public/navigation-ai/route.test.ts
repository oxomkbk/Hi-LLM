import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  NAVIGATION_AI_REQUEST_HEADER,
  NAVIGATION_AI_REQUEST_HEADER_VALUE,
} from '@/lib/navigation-ai/request-transport'

import { OPTIONS, POST } from './route'

vi.mock('server-only', () => ({}))

describe('navigation AI transport security', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects CORS preflight without granting cross-origin access', () => {
    const response = OPTIONS()

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, POST')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-headers')).toBeNull()
    expect(response.headers.get('access-control-allow-methods')).toBeNull()
  })

  it('maps defense-in-depth origin rejection to a structured 403', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://nav.example.com')
    vi.stubEnv('BETTER_AUTH_URL', '')

    const request = new NextRequest('https://nav.example.com/api/public/navigation-ai', {
      body: JSON.stringify({ messages: [{ content: 'AI 视频工具', role: 'user' }] }),
      headers: {
        'content-type': 'application/json',
        'origin': 'https://attacker.example',
        [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
      },
      method: 'POST',
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toMatchObject({
      error: {
        code: 'REQUEST_ORIGIN_INVALID',
        retryable: false,
      },
      msg: '请求来源校验失败',
    })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

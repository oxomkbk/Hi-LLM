import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse } from 'next/server'

import { REGISTRATION_DISABLED_SENTINEL } from '@/lib/access-settings/registration'
import { auth } from '@/lib/auth'

import type { NextRequest } from 'next/server'

const handlers = toNextJsHandler(auth)

export async function GET(request: NextRequest) {
  return normalizeAuthResponse(await handlers.GET(request), request)
}

export async function POST(request: NextRequest) {
  return normalizeAuthResponse(await handlers.POST(request), request)
}

function copyResponseHeaders(source: Headers, retryAfter?: string) {
  const headers = new Headers(source)
  headers.delete('content-length')
  if (retryAfter)
    headers.set('Retry-After', retryAfter)
  return headers
}

async function normalizeAuthResponse(response: Response, request: NextRequest) {
  const location = response.headers.get('location')
  if (location) {
    const target = new URL(location, request.url)
    if (
      target.origin === request.nextUrl.origin
      && target.pathname === '/login'
      && target.searchParams.get('error') === REGISTRATION_DISABLED_SENTINEL
    ) {
      target.searchParams.delete('error')
      target.searchParams.delete('error_description')
      target.searchParams.set('authError', 'registration-disabled')
      return NextResponse.redirect(target, { status: response.status })
    }
  }

  const retryAfter = response.headers.get('x-retry-after')
  if (retryAfter) {
    return NextResponse.json(
      { code: 'AUTH_RATE_LIMITED', message: '请求过于频繁，请稍后重试' },
      { status: 429, headers: copyResponseHeaders(response.headers, retryAfter) },
    )
  }

  if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
    const payload = await response.clone().json().catch(() => null) as { code?: string, message?: string } | null
    if (payload?.code === REGISTRATION_DISABLED_SENTINEL) {
      return NextResponse.json(
        { ...payload, code: 'REGISTRATION_DISABLED', message: '注册暂未开放' },
        { status: response.status, headers: copyResponseHeaders(response.headers) },
      )
    }
  }
  return response
}

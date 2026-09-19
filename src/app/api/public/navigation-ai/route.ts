import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'

import { searchCatalogWithAi } from '@/lib/catalog-ai/service'
import { isCatalogAiScope } from '@/lib/catalog-ai/types'
import { LlmRequestError } from '@/lib/llm/client'
import {
  isNavigationAiAvailable,
  LlmSettingsError,
  NavigationAiDisabledError,
} from '@/lib/llm/settings'
import { NavigationAiInputError, normalizeNavigationAiMessages } from '@/lib/navigation-ai/input'
import {
  NavigationAiDuplicateRequestError,
  NavigationAiRateLimitError,
  reserveNavigationAiRequest,
} from '@/lib/navigation-ai/rate-limit'
import { getNavigationAiSecuritySettings } from '@/lib/navigation-ai/security-settings'
import {
  assertNavigationAiRequestOrigin,
  createTrustedVisitorHash,
  RequestOriginValidationError,
} from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return NextResponse.json(responseMessage({ enabled: await isNavigationAiAvailable() }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  catch {
    return NextResponse.json(responseMessage({ enabled: false }, '无法读取 AI 检索状态', RESPONSE.ERROR), {
      headers: { 'Cache-Control': 'no-store' },
      status: 500,
    })
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: { Allow: 'GET, POST' },
    status: 405,
  })
}

export async function POST(request: NextRequest) {
  try {
    assertNavigationAiRequestOrigin(request)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 16 * 1024)
      return NextResponse.json(responseMessage(null, '请求内容过大', RESPONSE.ERROR), { status: 413 })

    const input = await request.json() as { messages?: unknown, scope?: unknown }
    const scope = input.scope ?? 'navigation'
    if (!isCatalogAiScope(scope))
      throw new NavigationAiInputError('AI 检索范围无效')
    const messages = normalizeNavigationAiMessages(input.messages)
    const [available, security] = await Promise.all([
      isNavigationAiAvailable(),
      getNavigationAiSecuritySettings(),
    ])
    if (!available)
      throw new NavigationAiDisabledError()
    if (security.abuseProtectionEnabled) {
      const visitorHash = createTrustedVisitorHash(request, 'navigation-ai')
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ messages, scope }))
        .digest('hex')
      await reserveNavigationAiRequest(visitorHash, fingerprint)
    }
    const result = await searchCatalogWithAi(scope, messages)
    return NextResponse.json(responseMessage(result))
  }
  catch (error) {
    const known = error instanceof NavigationAiInputError
      || error instanceof NavigationAiDuplicateRequestError
      || error instanceof NavigationAiRateLimitError
      || error instanceof LlmSettingsError
      || error instanceof LlmRequestError
      || error instanceof RequestOriginValidationError
    const status = error instanceof NavigationAiInputError
      || error instanceof NavigationAiDuplicateRequestError
      || error instanceof NavigationAiRateLimitError
      || error instanceof LlmSettingsError
      ? error.status
      : error instanceof RequestOriginValidationError
        ? error.status
        : error instanceof LlmRequestError
          ? 502
          : 500
    const code = known && 'code' in error ? String(error.code) : 'NAVIGATION_AI_FAILED'
    const message = known ? error.message : 'AI 检索暂时不可用，请稍后再试'
    return NextResponse.json(
      responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 429 }),
      { status },
    )
  }
}

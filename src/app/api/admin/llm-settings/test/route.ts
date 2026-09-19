import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { PUBLIC_SERVER_ERROR_MESSAGE } from '@/lib/http/public-error'
import { LlmRequestError } from '@/lib/llm/client'
import { LlmSettingsError, testSavedLlmSettings } from '@/lib/llm/settings'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const session = await requireSystemAdminSession(request.headers)
    return NextResponse.json(responseMessage(
      await testSavedLlmSettings(session.user.id),
      '大模型连接正常',
    ))
  }
  catch (error) {
    const known = error instanceof LlmSettingsError || error instanceof LlmRequestError
    const status = error instanceof LlmSettingsError
      ? error.status
      : error instanceof LlmRequestError
        ? 502
        : typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : 500
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
    return NextResponse.json(responseMessage(
      null,
      known || safeStatus < 500
        ? error instanceof Error ? error.message : '大模型连接测试失败'
        : PUBLIC_SERVER_ERROR_MESSAGE,
      RESPONSE.ERROR,
      { code: error instanceof LlmSettingsError
        ? error.code
        : error instanceof LlmRequestError
          ? error.code
          : safeStatus === 401
            ? 'AUTH_REQUIRED'
            : safeStatus === 403
              ? 'FORBIDDEN'
              : 'LLM_CHECK_FAILED', retryable: safeStatus >= 500 },
    ), { status: safeStatus })
  }
}

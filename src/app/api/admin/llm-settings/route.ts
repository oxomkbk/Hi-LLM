import { NextResponse } from 'next/server'

import { requireSystemAdminSession } from '@/lib/auth/session'
import { PUBLIC_SERVER_ERROR_MESSAGE } from '@/lib/http/public-error'
import {
  getAdminLlmSettings,
  LlmSettingsError,
  saveLlmSettings,
} from '@/lib/llm/settings'
import { assertSameOrigin } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireSystemAdminSession(request.headers)
    return NextResponse.json(responseMessage(await getAdminLlmSettings()), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  catch (error) {
    return llmSettingsErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireSystemAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    const data = await saveLlmSettings(input, session.user.id)
    return NextResponse.json(responseMessage(data, '大模型设置已保存'))
  }
  catch (error) {
    return llmSettingsErrorResponse(error)
  }
}

function llmSettingsErrorResponse(error: unknown) {
  const known = error instanceof LlmSettingsError
  const status = known
    ? error.status
    : typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
  const message = known || safeStatus < 500
    ? error instanceof Error ? error.message : '大模型设置失败'
    : PUBLIC_SERVER_ERROR_MESSAGE
  const code = known
    ? error.code
    : safeStatus === 401
      ? 'AUTH_REQUIRED'
      : safeStatus === 403
        ? 'FORBIDDEN'
        : 'LLM_SETTINGS_FAILED'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: safeStatus >= 500 }),
    { status: safeStatus },
  )
}

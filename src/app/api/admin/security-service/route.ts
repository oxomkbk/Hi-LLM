import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { setSecurityServiceState } from '@/lib/ai-security/service-state'
import { getSecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      readSecurityJsonBody(request),
    ])
    if (typeof input.enabled !== 'boolean')
      throw new SecurityHttpError('评测服务开关格式无效', 400, 'SECURITY_REQUEST_INVALID')
    if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) {
      throw new SecurityHttpError(
        '评测服务状态版本无效，请刷新后重试',
        400,
        'SECURITY_REQUEST_INVALID',
      )
    }

    const state = await setSecurityServiceState({
      enabled: input.enabled,
      expectedVersion: Number(input.expectedVersion),
    }, session.user)
    const runtime = await getSecurityWorkerRuntime()
    return securitySuccess({ runtime, state }, input.enabled ? '评测服务已开启' : '评测服务已暂停')
  }
  catch (error) {
    return securityErrorResponse(error, '评测服务状态保存失败')
  }
}

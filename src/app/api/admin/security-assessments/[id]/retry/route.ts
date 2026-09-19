import { readSecurityJsonBody, securityErrorResponse, securitySuccess } from '@/lib/ai-security/http'
import { retryAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    if (!isUuid(id))
      throw Object.assign(new Error('评测编号无效'), { code: 'SECURITY_REQUEST_INVALID', status: 400 })
    if (Number(request.headers.get('content-length') || 0) > 0)
      await readSecurityJsonBody(request)
    return securitySuccess(await retryAssessmentJob(id, session.user), '评测任务已重新入队', 201)
  }
  catch (error) {
    return securityErrorResponse(error)
  }
}

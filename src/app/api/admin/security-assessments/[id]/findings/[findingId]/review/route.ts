import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { reviewAssessmentFinding } from '@/lib/ai-security/review-service'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

const ACTIONS = new Set(['approve_false_positive', 'mark_false_positive', 'propose_false_positive', 'reopen'])

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ findingId: string, id: string }>
}) {
  try {
    assertSameOrigin(request)
    const [session, body, { findingId, id }] = await Promise.all([
      requireAdminSession(request.headers),
      readSecurityJsonBody(request),
      params,
    ])
    if (!isUuid(id) || !isUuid(findingId))
      throw new SecurityHttpError('评测或风险项编号无效', 400, 'SECURITY_REQUEST_INVALID')
    const action = String(body.action ?? '')
    if (!ACTIONS.has(action))
      throw new SecurityHttpError('风险复核操作无效', 400, 'SECURITY_REQUEST_INVALID')
    const result = await reviewAssessmentFinding({
      action: action as 'approve_false_positive' | 'mark_false_positive' | 'propose_false_positive' | 'reopen',
      actor: session.user,
      assessmentId: id,
      capabilities: securityCapabilitiesForAdmin(session.user.id),
      findingId,
      reason: typeof body.reason === 'string' ? body.reason : '',
      reviewOfId: typeof body.reviewOfId === 'string' ? body.reviewOfId : null,
    })
    return securitySuccess(result, '风险复核结果已保存', 201)
  }
  catch (error) {
    return securityErrorResponse(error, '风险复核失败')
  }
}

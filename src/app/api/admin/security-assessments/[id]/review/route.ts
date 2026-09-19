import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { resolveAssessmentReview } from '@/lib/ai-security/review-service'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

const ACTIONS = new Set(['accept_medium', 'revoke_override', 'temporary_high'])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const [session, body, { id }] = await Promise.all([
      requireAdminSession(request.headers),
      readSecurityJsonBody(request),
      params,
    ])
    if (!isUuid(id))
      throw new SecurityHttpError('评测编号无效', 400, 'SECURITY_REQUEST_INVALID')
    const action = String(body.action ?? '')
    if (!ACTIONS.has(action))
      throw new SecurityHttpError('复核操作无效', 400, 'SECURITY_REQUEST_INVALID')
    const result = await resolveAssessmentReview({
      action: action as 'accept_medium' | 'revoke_override' | 'temporary_high',
      actor: session.user,
      assessmentId: id,
      capabilities: securityCapabilitiesForAdmin(session.user.id),
      expiresAt: text(body.expiresAt),
      overrideId: text(body.overrideId),
      reason: text(body.reason) ?? '',
    })
    return securitySuccess(result, action === 'revoke_override' ? '风险处置已撤销' : '复核结果已保存', 201)
  }
  catch (error) {
    return securityErrorResponse(error, '复核操作失败')
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null
}

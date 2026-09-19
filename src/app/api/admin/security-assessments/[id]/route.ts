import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { securityErrorResponse, securitySuccess } from '@/lib/ai-security/http'
import { deleteAssessmentReport, getAdminAssessmentDetail } from '@/lib/ai-security/service'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    if (!isUuid(id))
      return securityErrorResponse(Object.assign(new Error('评测编号无效'), { code: 'SECURITY_REQUEST_INVALID', status: 400 }))
    return securitySuccess(await deleteAssessmentReport(id, session.user), '评测报告已删除')
  }
  catch (error) {
    return securityErrorResponse(error, '评测报告删除失败')
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    if (!isUuid(id))
      return securityErrorResponse(Object.assign(new Error('评测编号无效'), { code: 'SECURITY_REQUEST_INVALID', status: 400 }))
    const detail = await getAdminAssessmentDetail(id)
    return securitySuccess({
      ...detail,
      capabilities: securityCapabilitiesForAdmin(session.user.id),
    })
  }
  catch (error) {
    return securityErrorResponse(error, '评测报告加载失败')
  }
}

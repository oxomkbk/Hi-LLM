import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { setSecuritySubjectIgnored } from '@/lib/ai-security/subject-ignore'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { SecuritySubjectType } from '@/lib/ai-security/domain'
import type { NextRequest } from 'next/server'

const SUBJECT_TYPES = new Set(['skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt'])

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ subjectId: string, subjectType: string }>
}) {
  try {
    assertSameOrigin(request)
    const [session, path, body] = await Promise.all([
      requireAdminSession(request.headers),
      params,
      readSecurityJsonBody(request),
    ])
    if (!SUBJECT_TYPES.has(path.subjectType) || !isUuid(path.subjectId))
      throw new SecurityHttpError('评测对象参数无效', 400, 'SECURITY_REQUEST_INVALID')
    if (typeof body.ignored !== 'boolean')
      throw new SecurityHttpError('忽略状态无效', 400, 'SECURITY_REQUEST_INVALID')
    const reason = body.reason === undefined || body.reason === null
      ? null
      : typeof body.reason === 'string'
        ? body.reason
        : (() => { throw new SecurityHttpError('忽略原因无效', 400, 'SECURITY_REQUEST_INVALID') })()
    const result = await setSecuritySubjectIgnored({
      actor: session.user,
      ignored: body.ignored,
      reason,
      subjectId: path.subjectId,
      subjectType: path.subjectType as SecuritySubjectType,
    })
    return securitySuccess(result, body.ignored ? '已忽略该内容，已有报告仍会保留' : '内容已恢复到评测目录')
  }
  catch (error) {
    return securityErrorResponse(error, '评测对象状态保存失败')
  }
}

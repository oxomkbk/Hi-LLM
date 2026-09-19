import {
  readSecurityJsonBody,
  securityErrorResponse,
  SecurityHttpError,
  securitySuccess,
} from '@/lib/ai-security/http'
import { checkSecuritySubjectSource } from '@/lib/ai-security/source-check'
import { SECURITY_SOURCE_CHECK_SUBJECT_TYPES } from '@/lib/ai-security/source-check-contract'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { SecuritySourceCheckSubjectType } from '@/lib/ai-security/source-check-contract'
import type { NextRequest } from 'next/server'

const ALLOWED_BODY_KEYS = new Set(['subjectId', 'subjectType'])
const SUBJECT_TYPES = new Set<string>(SECURITY_SOURCE_CHECK_SUBJECT_TYPES)

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [input] = await Promise.all([
      readSecurityJsonBody(request),
      requireAdminSession(request.headers),
    ])
    if (Object.keys(input).some(key => !ALLOWED_BODY_KEYS.has(key)))
      invalidRequest()
    const subjectId = typeof input.subjectId === 'string' ? input.subjectId.normalize('NFC').trim() : ''
    const subjectType = typeof input.subjectType === 'string' ? input.subjectType.normalize('NFC').trim() : ''
    if (!isUuid(subjectId) || !SUBJECT_TYPES.has(subjectType))
      invalidRequest()

    const result = await checkSecuritySubjectSource({
      subjectId,
      subjectType: subjectType as SecuritySourceCheckSubjectType,
    })
    return securitySuccess(result, '来源检查通过')
  }
  catch (error) {
    return securityErrorResponse(error, '来源检查失败')
  }
}

function invalidRequest(): never {
  throw new SecurityHttpError('来源检查参数无效', 400, 'SOURCE_CHECK_REQUEST_INVALID')
}

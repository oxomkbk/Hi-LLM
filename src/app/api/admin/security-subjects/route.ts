import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { SECURITY_REPORT_STATES, SECURITY_SUBJECT_TYPES } from '@/lib/ai-security/domain'
import { securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { listAdminSecuritySubjects } from '@/lib/ai-security/subject-catalog'
import { requireAdminSession } from '@/lib/auth/session'

import type { SecurityReportState, SecuritySubjectType } from '@/lib/ai-security/domain'
import type { NextRequest } from 'next/server'

const CONTENT_STATUSES = new Set(['approved', 'archived', 'draft', 'pending', 'pending_security', 'published', 'rejected'])
const REPORT_STATES = new Set<string>(SECURITY_REPORT_STATES)
const SUBJECT_TYPES = new Set<string>(SECURITY_SUBJECT_TYPES)
const CATALOG_SCOPES = new Set(['active', 'all', 'ignored'])

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const subjectType = optionalEnum(params.get('subjectType'), SUBJECT_TYPES, '主体类型') as SecuritySubjectType | undefined
    const contentStatus = optionalEnum(params.get('contentStatus'), CONTENT_STATUSES, '内容状态')
    const reportState = optionalEnum(params.get('reportState'), REPORT_STATES, '报告状态') as SecurityReportState | undefined
    const q = cleanText(params.get('q'), 120)
    const scope = optionalEnum(params.get('scope') || 'active', CATALOG_SCOPES, '目录范围')
    return securitySuccess(await listAdminSecuritySubjects({
      contentStatus,
      ignored: scope === 'all' ? undefined : scope === 'ignored',
      pageIndex: integer(params.get('pageIndex'), 0, 0, 100_000),
      pageSize: integer(params.get('pageSize'), 20, 1, 100),
      q: q || undefined,
      reportState,
      subjectType,
    }, securityCapabilitiesForAdmin(session.user.id)))
  }
  catch (error) {
    return securityErrorResponse(error, '安全评测对象加载失败')
  }
}

function cleanText(value: string | null, maximum: number) {
  return value?.normalize('NFC').trim().slice(0, maximum) ?? ''
}

function integer(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new SecurityHttpError('分页参数无效', 400, 'SECURITY_REQUEST_INVALID')
  return parsed
}

function optionalEnum(value: string | null, allowed: Set<string>, label: string) {
  if (!value)
    return undefined
  if (!allowed.has(value))
    throw new SecurityHttpError(`${label}无效`, 400, 'SECURITY_REQUEST_INVALID')
  return value
}

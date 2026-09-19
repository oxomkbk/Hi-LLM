import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { createAssessmentJob } from '@/lib/ai-security/queue'
import { listAdminAssessments } from '@/lib/ai-security/service'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { SecurityAssessmentStatus, SecurityReportState, SecuritySubjectType } from '@/lib/ai-security/domain'
import type { NextRequest } from 'next/server'

const ASSESSMENT_STATUSES = new Set(['queued', 'preparing', 'running', 'completed', 'failed', 'cancelled'])
const REPORT_STATES = new Set(['unassessed', 'passed', 'review_required', 'blocked', 'failed', 'stale'])
const SUBJECT_TYPES = new Set(['skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const status = optionalEnum(params.get('status'), ASSESSMENT_STATUSES, '任务状态') as SecurityAssessmentStatus | undefined
    const reportState = optionalEnum(params.get('reportState'), REPORT_STATES, '报告状态') as SecurityReportState | undefined
    const subjectType = optionalEnum(params.get('subjectType'), SUBJECT_TYPES, '主体类型') as SecuritySubjectType | undefined
    const q = cleanText(params.get('q'), 120)
    return securitySuccess(await listAdminAssessments({
      pageIndex: integer(params.get('pageIndex'), 0, 0, 100_000),
      pageSize: integer(params.get('pageSize'), 20, 1, 100),
      q: q || undefined,
      reportState,
      status,
      subjectType,
    }))
  }
  catch (error) {
    return securityErrorResponse(error, '安全评测列表加载失败')
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      readSecurityJsonBody(request),
    ])
    const subjectType = optionalEnum(String(input.subjectType ?? ''), SUBJECT_TYPES, '主体类型') as SecuritySubjectType | undefined
    const subjectId = cleanText(typeof input.subjectId === 'string' ? input.subjectId : null, 36)
    if (!subjectType || !subjectId || !isUuid(subjectId))
      throw new SecurityHttpError('评测主体参数无效', 400, 'SECURITY_REQUEST_INVALID')
    if (input.force !== undefined && typeof input.force !== 'boolean')
      throw new SecurityHttpError('重扫参数无效', 400, 'SECURITY_REQUEST_INVALID')
    const result = await createAssessmentJob({
      actor: session.user,
      force: input.force === true,
      requestId: input.force === true ? cleanText(typeof input.requestId === 'string' ? input.requestId : null, 180) : null,
      subjectId,
      subjectType,
      trigger: 'manual',
    })
    return securitySuccess(result, result.kind === 'reused' ? '已复用当前有效报告' : '安全评测已加入队列', result.kind === 'queued' ? 201 : 200)
  }
  catch (error) {
    return securityErrorResponse(error)
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

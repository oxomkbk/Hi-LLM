import { NextResponse } from 'next/server'

import { AccessSettingsError, requireSubmissionAccess } from '@/lib/access-settings/service'
import { createSystemAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { SkillSubmissionError, skillSubmissionRepository } from '@/lib/repositories/skill-submissions'
import { skillRepository } from '@/lib/repositories/skills'
import { assertSameOrigin, createTrustedVisitorHash } from '@/lib/security'
import {
  readSkillJsonBody,
  sanitizeSkillInput,
  sanitizeSkillSearchTerm,
  sanitizeSubmitter,
} from '@/lib/skills'
import { ensureUniqueSkillSlug } from '@/lib/skills-server'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { SkillSubmissionStatus } from '@/types'
import type { NextRequest } from 'next/server'

const ALLOWED_STATUS = new Set<SkillSubmissionStatus>(['approved', 'pending', 'pending_security', 'rejected'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const pageIndex = parseInteger(params.get('pageIndex'), 0, 0, 10_000)
    const pageSize = parseInteger(params.get('pageSize'), 20, 1, 100)
    const q = sanitizeSkillSearchTerm(params.get('q'))
    const status = params.get('status') as SkillSubmissionStatus | null
    if (status && !ALLOWED_STATUS.has(status))
      return NextResponse.json(responseMessage(null, '投稿状态无效', RESPONSE.ERROR), { status: 400 })
    const data = await skillSubmissionRepository.list({
      limit: pageSize,
      offset: pageIndex * pageSize,
      q,
      status: status ?? undefined,
    })
    return NextResponse.json(responseMessage({ ...data, page: pageIndex + 1, pageSize }))
  }
  catch (error) {
    return routeError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('skill', request.headers)
    const input = await readSkillJsonBody(request)
    if (input.company)
      return NextResponse.json(responseMessage(null, '提交成功'))
    const skill = sanitizeSkillInput(input, { generateSlug: true })
    const submitter = sanitizeSubmitter(input, skill.author_name)
    if (skill.source_kind === 'platform_content') {
      if (await skillRepository.slugExists(skill.slug))
        throw new SkillSubmissionError('同名站内 Skill 已提交或已发布，请调整名称后重试', 409)
    }
    else {
      skill.slug = await ensureUniqueSkillSlug(skill.slug)
    }
    const data = await skillSubmissionRepository.create(
      skill,
      submitter,
      createTrustedVisitorHash(request, 'skill-submission'),
    )
    const assessment = await createSystemAssessmentJob({
      subjectId: data.id,
      subjectType: 'skill_submission',
    }).catch(() => null)
    return NextResponse.json(responseMessage({
      ...data,
      security_scan_queued: Boolean(assessment),
    }, assessment
      ? '提交成功，安全检查已自动开始'
      : '提交成功，管理员审核后会出现在 Skills 社区'), { status: 201 })
  }
  catch (error) {
    return routeError(error)
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === '')
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('分页参数无效')
  return parsed
}

function routeError(error: unknown) {
  const message = (error as Error).message
  const status = error instanceof AccessSettingsError
    ? error.status
    : error instanceof SkillSubmissionError
      ? error.status
      : databaseErrorCode(error) === '23505'
        ? 409
        : typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : message === '请求来源校验失败'
            ? 403
            : message.includes('64KB')
              ? 413
              : 400
  const code = error instanceof AccessSettingsError ? error.code : 'SKILL_SUBMISSION_FAILED'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { status },
  )
}

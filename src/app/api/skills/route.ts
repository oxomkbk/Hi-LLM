import { NextResponse } from 'next/server'

import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { skillRepository, SkillRepositoryError } from '@/lib/repositories/skills'
import {
  readSkillJsonBody,
  sanitizeSkillAdminInput,
  sanitizeSkillSearchTerm,
  SKILL_CATEGORIES,
  SKILL_PLATFORMS,
} from '@/lib/skills'
import { ensureUniqueSkillSlug } from '@/lib/skills-server'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { SkillStatus } from '@/types'
import type { NextRequest } from 'next/server'

const ALLOWED_STATUS = new Set<SkillStatus>(['archived', 'draft', 'published'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)

    const searchParams = request.nextUrl.searchParams
    const pageIndex = parseInteger(searchParams.get('pageIndex'), 0, 0, 10000)
    const pageSize = parseInteger(searchParams.get('pageSize'), 20, 1, 100)
    const q = sanitizeSkillSearchTerm(searchParams.get('q'))
    const category = searchParams.get('category')?.trim() || ''
    const platform = searchParams.get('platform')?.trim() || ''
    const status = searchParams.get('status') as SkillStatus | null
    const featured = parseOptionalBoolean(searchParams.get('featured'))

    if (category && !(SKILL_CATEGORIES as readonly string[]).includes(category))
      return NextResponse.json(responseMessage(null, 'Skill 分类无效', RESPONSE.ERROR), { status: 400 })
    if (platform && !(SKILL_PLATFORMS as readonly string[]).includes(platform))
      return NextResponse.json(responseMessage(null, '适用平台无效', RESPONSE.ERROR), { status: 400 })
    if (status && !ALLOWED_STATUS.has(status))
      return NextResponse.json(responseMessage(null, 'Skill 状态无效', RESPONSE.ERROR), { status: 400 })

    const start = pageIndex * pageSize
    const { list, total } = await skillRepository.list({
      category: category || undefined,
      featured,
      limit: pageSize,
      offset: start,
      platform: platform || undefined,
      q: q || undefined,
      status,
    })

    return NextResponse.json(responseMessage({
      list,
      page: pageIndex + 1,
      pageSize,
      total,
    }))
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      readSkillJsonBody(request),
    ])
    const skill = sanitizeSkillAdminInput(input)
    skill.slug = await ensureUniqueSkillSlug(skill.slug)
    const data = await skillRepository.create(skill, session.user)
    if (data.publish_requested_at) {
      const queued = await createAssessmentJob({ actor: session.user, subjectId: data.id, subjectType: 'skill', trigger: 'publish_gate' })
        .then(() => true)
        .catch(() => false)
      return NextResponse.json(responseMessage(data, queued ? 'Skill 已保存，安全检查通过后会自动发布' : 'Skill 已保存，安全检查暂未启动'), { status: 202 })
    }
    return NextResponse.json(responseMessage(data, skill.status === 'published' ? 'Skill 已发布' : 'Skill 草稿已保存'), { status: 201 })
  }
  catch (error) {
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof SkillRepositoryError ? error.status : duplicate ? 409 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'Skill 地址或源地址已存在' : (error as Error).message, RESPONSE.ERROR), { status })
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

function parseOptionalBoolean(value: string | null) {
  if (value === null || value === '')
    return null
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error('精选筛选参数无效')
}

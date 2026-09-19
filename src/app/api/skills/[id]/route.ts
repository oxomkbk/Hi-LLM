import { NextResponse } from 'next/server'

import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { skillRepository, SkillRepositoryError } from '@/lib/repositories/skills'
import { isUuid } from '@/lib/security'
import {
  readSkillJsonBody,
  sanitizeSkillAdminInput,
} from '@/lib/skills'
import { ensureUniqueSkillSlug } from '@/lib/skills-server'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'Skill 参数无效', RESPONSE.ERROR), { status: 400 })

    const data = await skillRepository.delete(id)
    if (!data)
      return NextResponse.json(responseMessage(null, 'Skill 不存在', RESPONSE.ERROR), { status: 404 })

    return NextResponse.json(responseMessage(data, 'Skill 已删除'))
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }] = await Promise.all([params, requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'Skill 参数无效', RESPONSE.ERROR), { status: 400 })
    const data = await skillRepository.findById(id)
    if (!data)
      return NextResponse.json(responseMessage(null, 'Skill 不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input, session] = await Promise.all([
      params,
      readSkillJsonBody(request),
      requireAdminSession(request.headers),
    ])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'Skill 参数无效', RESPONSE.ERROR), { status: 400 })

    const current = await skillRepository.findById(id)
    if (!current)
      return NextResponse.json(responseMessage(null, 'Skill 不存在', RESPONSE.ERROR), { status: 404 })

    const skill = sanitizeSkillAdminInput(input)
    skill.slug = await ensureUniqueSkillSlug(skill.slug, { excludeSkillId: id })
    const data = await skillRepository.update(id, skill, session.user, current)
    if (data?.publish_requested_at) {
      const queued = await createAssessmentJob({ actor: session.user, subjectId: data.id, subjectType: 'skill', trigger: 'publish_gate' })
        .then(() => true)
        .catch(() => false)
      return NextResponse.json(responseMessage(data, queued ? 'Skill 更新已保存，安全检查通过后会自动发布' : 'Skill 更新已保存，安全检查暂未启动'), { status: 202 })
    }
    return NextResponse.json(responseMessage(data, skill.status === 'published' ? 'Skill 更新已发布' : 'Skill 草稿已保存'))
  }
  catch (error) {
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof SkillRepositoryError ? error.status : duplicate ? 409 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'Skill 地址或源地址已存在' : (error as Error).message, RESPONSE.ERROR), { status })
  }
}

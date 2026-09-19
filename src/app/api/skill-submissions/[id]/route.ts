import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { skillSubmissionRepository } from '@/lib/repositories/skill-submissions'
import { isUuid } from '@/lib/security'
import { readSkillJsonBody, sanitizeSkillInput, sanitizeSubmitter } from '@/lib/skills'
import { ensureUniqueSkillSlug } from '@/lib/skills-server'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }] = await Promise.all([params, requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const data = await skillSubmissionRepository.findById(id)
    if (!data)
      return NextResponse.json(responseMessage(null, '投稿不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([params, readSkillJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const current = await skillSubmissionRepository.findById(id)
    if (!current)
      return NextResponse.json(responseMessage(null, '投稿不存在', RESPONSE.ERROR), { status: 404 })
    if (current.status === 'approved')
      return NextResponse.json(responseMessage(null, '已通过的投稿请在 Skills 列表中修改', RESPONSE.ERROR), { status: 409 })

    const skill = sanitizeSkillInput(input)
    const submitter = sanitizeSubmitter({
      submitter_email: input.submitter_email === undefined ? current.submitter_email : input.submitter_email,
      submitter_name: input.submitter_name === undefined ? current.submitter_name : input.submitter_name,
    }, skill.author_name)
    skill.slug = await ensureUniqueSkillSlug(skill.slug, { excludeSubmissionId: id })
    const data = await skillSubmissionRepository.update(id, skill, submitter)
    if (!data)
      return NextResponse.json(responseMessage(null, '投稿状态已变化', RESPONSE.ERROR), { status: 409 })
    return NextResponse.json(responseMessage(data, '投稿修改成功'))
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    return NextResponse.json(
      responseMessage(null, duplicate ? 'Skill 地址或源地址已存在' : message, RESPONSE.ERROR),
      { status: duplicate ? 409 : message.includes('64KB') ? 413 : 400 },
    )
  }
}

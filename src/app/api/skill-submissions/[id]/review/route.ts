import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { SkillSubmissionError, skillSubmissionRepository } from '@/lib/repositories/skill-submissions'
import { isUuid } from '@/lib/security'
import { readSkillJsonBody, sanitizeReviewNote, sanitizeSkillInput, sanitizeSubmitter } from '@/lib/skills'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input, session] = await Promise.all([params, readSkillJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const actor = { email: session.user.email, id: session.user.id }
    if (input.action === 'approve') {
      const reviewNote = sanitizeReviewNote(input.review_note)
      const edited = input.content && typeof input.content === 'object' && !Array.isArray(input.content)
        ? (() => {
            const content = input.content as Record<string, unknown>
            const skill = sanitizeSkillInput(content)
            return {
              expectedUpdatedAt: typeof input.expected_updated_at === 'string' ? input.expected_updated_at : undefined,
              skill,
              submitter: sanitizeSubmitter(content, skill.author_name),
            }
          })()
        : undefined
      const data = await skillSubmissionRepository.approve(id, actor, edited, reviewNote)
      revalidateTag('skills:public', 'max')
      revalidateTag(`skill:${data.slug}`, 'max')
      return NextResponse.json(responseMessage(data, '审核通过，Skill 已发布'))
    }
    if (input.action === 'reject') {
      const note = sanitizeReviewNote(input.review_note)
      if (!note)
        return NextResponse.json(responseMessage(null, '请填写拒绝原因', RESPONSE.ERROR), { status: 400 })
      const data = await skillSubmissionRepository.reject(id, actor, note)
      if (!data)
        return NextResponse.json(responseMessage(null, '仅待审核投稿可以拒绝', RESPONSE.ERROR), { status: 409 })
      return NextResponse.json(responseMessage(data, '已拒绝该投稿'))
    }
    return NextResponse.json(responseMessage(null, '审核操作无效', RESPONSE.ERROR), { status: 400 })
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof SkillSubmissionError ? error.status : duplicate ? 409 : message.includes('64KB') ? 413 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'Skill 地址或源地址已存在' : message, RESPONSE.ERROR), { status })
  }
}

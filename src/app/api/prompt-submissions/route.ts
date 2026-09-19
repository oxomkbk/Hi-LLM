import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { databaseErrorCode, queryBusiness } from '@/lib/db/business'
import { readPromptJsonBody, sanitizePromptSubmissionInput } from '@/lib/prompts'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  let submissionKey = ''
  let userId = ''
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('prompt', request.headers)
    const [session, body] = await Promise.all([
      requireUserSession(request.headers),
      readPromptJsonBody(request),
    ])
    userId = session.user.id
    if (body.submissionKey !== undefined && (typeof body.submissionKey !== 'string' || !isUuid(body.submissionKey))) {
      throw Object.assign(new Error('投稿标识无效，请刷新页面后重试'), {
        code: 'PROMPT_SUBMISSION_KEY_INVALID',
        status: 400,
      })
    }
    submissionKey = typeof body.submissionKey === 'string' ? body.submissionKey.toLowerCase() : ''
    const sanitized = sanitizePromptSubmissionInput(body)
    const stableSlug = submissionKey ? `community-${submissionKey}` : sanitized.slug
    const existing = submissionKey ? await findOwnedSubmission(stableSlug, userId) : null
    if (existing) {
      if (existing.submitted_at || existing.status !== 'draft') {
        return promptSuccess(
          { alreadySubmitted: true, id: existing.id, reused: true },
          '这次投稿已经完成，无需重复创建',
        )
      }
      const current = await promptRepository.findById(existing.id)
      if (!current)
        throw new Error('投稿草稿暂时无法读取，请稍后重试')
      await promptRepository.update(existing.id, { ...sanitized, slug: existing.slug }, session.user, current)
      return promptSuccess(
        { alreadySubmitted: false, id: existing.id, reused: true },
        '已恢复原投稿草稿，可以继续上传资源',
      )
    }
    const created = await promptRepository.create(
      { ...sanitized, slug: stableSlug },
      session.user,
      { origin: 'community' },
    )
    return promptSuccess({ alreadySubmitted: false, id: created.id, reused: false }, 'Prompt 草稿已创建，可以继续上传资源', 201)
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505' && submissionKey && userId) {
      const existing = await findOwnedSubmission(`community-${submissionKey}`, userId).catch(() => null)
      if (existing) {
        const alreadySubmitted = Boolean(existing.submitted_at || existing.status !== 'draft')
        return promptSuccess(
          { alreadySubmitted, id: existing.id, reused: true },
          alreadySubmitted ? '这次投稿已经完成，无需重复创建' : '已恢复原投稿草稿，可以继续上传资源',
        )
      }
    }
    if (databaseErrorCode(error) === '23505')
      return promptErrorResponse(Object.assign(new Error('投稿地址冲突，请重新提交'), { status: 409, code: 'PROMPT_SUBMISSION_CONFLICT' }))
    return promptErrorResponse(error)
  }
}

async function findOwnedSubmission(slug: string, userId: string) {
  const result = await queryBusiness<{ id: string, slug: string, status: string, submitted_at: Date | null }>(`
    select id, slug, status, submitted_at
    from public.ds_prompts
    where slug = $1 and created_by = $2::uuid
      and submission_origin = 'community'
    limit 1
  `, [slug, userId])
  return result.rows[0] ?? null
}

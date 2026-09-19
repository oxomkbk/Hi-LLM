import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { createQuestion } from '@/lib/wonderland/services/community'
import { parseIdempotencyKey, sanitizeQuestionInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    await requireSubmissionAccess('wonderland', request.headers)
    const session = await requireUserSession(request.headers)
    const body = await request.json() as Record<string, unknown>
    const input = sanitizeQuestionInput(body)
    const data = await createQuestion({
      actor: session.user,
      categoryId: input.categoryId,
      content: input.content,
      idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
      summary: input.summary,
      tagIds: input.tagIds,
      title: input.title,
    })
    return wonderlandSuccess(data, '问题发布成功', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

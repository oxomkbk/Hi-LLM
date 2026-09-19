import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { createAnswer } from '@/lib/wonderland/services/community'
import { parseIdempotencyKey, sanitizeAnswerInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSubmissionAccess('wonderland', request.headers)
    const session = await requireUserSession(request.headers)
    const [body, { id }] = await Promise.all([
      request.json() as Promise<Record<string, unknown>>,
      params,
    ])
    if (!isUuid(id))
      throw new WonderlandError('问题编号无效', 400, 'QUESTION_ID_INVALID')
    const input = sanitizeAnswerInput(body)
    const data = await createAnswer({
      actor: session.user,
      content: input.content,
      idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
      questionId: id,
    })
    return wonderlandSuccess(data, '回答发布成功', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

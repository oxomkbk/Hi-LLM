import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { createComment } from '@/lib/wonderland/services/community'
import { sanitizeCommentInput } from '@/lib/wonderland/validation'

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
      throw new WonderlandError('新闻编号无效', 400, 'NEWS_ID_INVALID')
    const input = sanitizeCommentInput(body)
    const data = await createComment({
      actor: session.user,
      body: input.body,
      fileIds: input.fileIds,
      newsId: id,
      parentId: input.parentId,
    })
    return wonderlandSuccess(data, '评论发布成功', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

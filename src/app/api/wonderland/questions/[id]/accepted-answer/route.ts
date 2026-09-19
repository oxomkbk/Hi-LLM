import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { acceptAnswer } from '@/lib/wonderland/services/community'

import type { NextRequest } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
      params,
    ])
    if (!isUuid(id) || !isUuid(body.answerId) || typeof body.selected !== 'boolean')
      throw new WonderlandError('采纳参数无效', 400, 'ANSWER_ACCEPT_INVALID')
    const data = await acceptAnswer({
      actor: session.user,
      answerId: body.answerId,
      questionId: id,
      selected: body.selected,
    })
    return wonderlandSuccess(data, body.selected ? '回答已采纳' : '已取消采纳')
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

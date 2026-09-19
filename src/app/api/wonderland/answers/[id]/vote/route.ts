import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { setAnswerVote } from '@/lib/wonderland/services/community'

import type { NextRequest } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
      params,
    ])
    if (!isUuid(id) || (body.value !== -1 && body.value !== 0 && body.value !== 1))
      throw new WonderlandError('投票参数无效', 400, 'VOTE_INVALID')
    return wonderlandSuccess(await setAnswerVote({ actor: session.user, answerId: id, value: body.value }))
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

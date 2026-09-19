import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { setQuestionEngagement } from '@/lib/wonderland/services/community'

import type { NextRequest } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
      params,
    ])
    if (!isUuid(id) || (body.type !== 'favorite' && body.type !== 'follow') || typeof body.selected !== 'boolean')
      throw new WonderlandError('互动参数无效', 400, 'ENGAGEMENT_INVALID')
    const data = await setQuestionEngagement({
      actor: session.user,
      questionId: id,
      selected: body.selected,
      type: body.type,
    })
    return wonderlandSuccess(data)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

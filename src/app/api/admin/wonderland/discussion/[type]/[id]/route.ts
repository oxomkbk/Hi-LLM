import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { moderateWonderDiscussion } from '@/lib/wonderland/services/admin'

import type { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string, type: string }> }) {
  try {
    const [session, body, { id, type }] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>, params])
    const actionIsValid = body.action === 'hide' || body.action === 'restore' || (type === 'answer' && body.action === 'delete')
    if (!isUuid(id) || (type !== 'answer' && type !== 'comment') || !actionIsValid)
      throw new WonderlandError('审核参数无效', 400, 'DISCUSSION_MODERATION_INVALID')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''
    if (reason.length < 2)
      throw new WonderlandError('请填写处理原因', 400, 'MODERATION_REASON_REQUIRED')
    const data = await moderateWonderDiscussion({ action: body.action as 'delete' | 'hide' | 'restore', actor: session.user, id, reason, type })
    return wonderlandSuccess(data, '讨论内容状态已更新')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

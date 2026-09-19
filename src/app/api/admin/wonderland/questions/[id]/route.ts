import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { moderateWonderQuestion } from '@/lib/wonderland/services/admin'

import type { NextRequest } from 'next/server'

const ACTIONS = new Set(['close', 'delete', 'hide', 'lock', 'reopen', 'restore', 'unlock'] as const)

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>, params])
    if (!isUuid(id) || typeof body.action !== 'string' || !ACTIONS.has(body.action as any))
      throw new WonderlandError('审核参数无效', 400, 'MODERATION_INVALID')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''
    if (reason.length < 2)
      throw new WonderlandError('请填写处理原因', 400, 'MODERATION_REASON_REQUIRED')
    return wonderlandSuccess(await moderateWonderQuestion({ action: body.action as any, actor: session.user, id, reason }), '问题状态已更新')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

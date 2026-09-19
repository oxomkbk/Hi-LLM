import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { findAdminWonderWork } from '@/lib/wonderland/repositories/admin'
import { moderateWonderWork, saveWonderWork } from '@/lib/wonderland/services/admin'
import { sanitizeWorkInput } from '@/lib/wonderland/work-validation'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new WonderlandError('作品编号无效', 400, 'WORK_ID_INVALID')
    const work = await findAdminWonderWork(id)
    if (!work)
      throw new WonderlandError('作品不存在', 404, 'WORK_NOT_FOUND')
    return wonderlandSuccess(work)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([
      requireAdminSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
      params,
    ])
    if (!isUuid(id))
      throw new WonderlandError('审核参数无效', 400, 'WORK_MODERATION_INVALID')
    if (body.action === 'edit') {
      return wonderlandSuccess(await saveWonderWork({
        actor: session.user,
        expectedUpdatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
        id,
        work: sanitizeWorkInput(body),
      }), '作品已更新')
    }
    if (body.action !== 'delete' && body.action !== 'hide' && body.action !== 'restore')
      throw new WonderlandError('审核参数无效', 400, 'WORK_MODERATION_INVALID')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''
    if (reason.length < 2)
      throw new WonderlandError('请填写处理原因', 400, 'MODERATION_REASON_REQUIRED')
    return wonderlandSuccess(await moderateWonderWork({ action: body.action, actor: session.user, id, reason }), '作品状态已更新')
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

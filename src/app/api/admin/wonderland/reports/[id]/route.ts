import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { resolveWonderReport } from '@/lib/wonderland/services/admin'

import type { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, body, { id }] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<Record<string, unknown>>, params])
    if (!isUuid(id) || (body.status !== 'resolved' && body.status !== 'dismissed'))
      throw new WonderlandError('举报处理参数无效', 400, 'REPORT_RESOLUTION_INVALID')
    const resolution = typeof body.resolution === 'string' ? body.resolution.trim().slice(0, 1000) : ''
    if (resolution.length < 2)
      throw new WonderlandError('请填写处理结论', 400, 'REPORT_RESOLUTION_REQUIRED')
    return wonderlandSuccess(await resolveWonderReport({ actor: session.user, id, resolution, status: body.status }), '举报已处理')
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

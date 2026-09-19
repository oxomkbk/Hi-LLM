import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { listWonderlandNotifications } from '@/lib/wonderland/repositories/community'
import { markNotificationsRead } from '@/lib/wonderland/services/community'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await requireUserSession(request.headers)
    return wonderlandSuccess(await listWonderlandNotifications(session.user.id))
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : []
    if (ids.length > 100 || ids.some(id => !isUuid(id)))
      throw new WonderlandError('通知编号无效', 400, 'NOTIFICATION_IDS_INVALID')
    return wonderlandSuccess(await markNotificationsRead(session.user, ids as string[]))
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

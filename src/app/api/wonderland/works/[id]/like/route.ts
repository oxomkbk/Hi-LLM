import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { toggleWorkLike } from '@/lib/wonderland/services/works'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, session] = await Promise.all([
      params,
      requireUserSession(request.headers),
    ])
    if (!isUuid(id))
      throw new WonderlandError('作品编号无效', 400, 'WORK_ID_INVALID')
    return wonderlandSuccess(await toggleWorkLike({ actor: session.user, workId: id }))
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

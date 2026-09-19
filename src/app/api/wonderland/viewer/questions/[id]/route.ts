import { requireUserSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { getWonderlandViewerState } from '@/lib/wonderland/repositories/community'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([requireUserSession(request.headers), params])
    if (!isUuid(id))
      throw new WonderlandError('问题编号无效', 400, 'QUESTION_ID_INVALID')
    return wonderlandSuccess(await getWonderlandViewerState(id, session.user.id))
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

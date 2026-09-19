import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { createWork } from '@/lib/wonderland/services/works'
import { parseIdempotencyKey } from '@/lib/wonderland/validation'
import { sanitizeWorkInput } from '@/lib/wonderland/work-validation'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    await requireSubmissionAccess('work', request.headers)
    const [session, body] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<unknown>,
    ])
    const input = sanitizeWorkInput(body)
    const data = await createWork({
      actor: session.user,
      ...input,
      idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
    })
    return wonderlandSuccess(data, '作品发布成功', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

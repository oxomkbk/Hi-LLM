import { requireUserSession } from '@/lib/auth/session'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { createReport } from '@/lib/wonderland/services/community'
import { sanitizeReportInput } from '@/lib/wonderland/validation'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      requireUserSession(request.headers),
      request.json() as Promise<Record<string, unknown>>,
    ])
    const input = sanitizeReportInput(body)
    const data = await createReport({ actor: session.user, ...input })
    return wonderlandSuccess(data, '举报已提交', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

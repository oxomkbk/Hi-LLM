import { requireAdminSession } from '@/lib/auth/session'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { listAdminWonderWorks } from '@/lib/wonderland/repositories/admin'
import { createWork } from '@/lib/wonderland/services/works'
import { parseIdempotencyKey } from '@/lib/wonderland/validation'
import { sanitizeWorkInput } from '@/lib/wonderland/work-validation'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const pageIndex = Math.max(0, Number(request.nextUrl.searchParams.get('pageIndex') || 0))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20)))
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100) || undefined
    const rawVisibility = request.nextUrl.searchParams.get('visibility')
    if (rawVisibility && rawVisibility !== 'visible' && rawVisibility !== 'hidden' && rawVisibility !== 'deleted')
      throw new WonderlandError('作品状态无效', 400, 'WORK_VISIBILITY_INVALID')
    const result = await listAdminWonderWorks({
      limit: pageSize,
      offset: pageIndex * pageSize,
      q,
      visibility: rawVisibility || undefined,
    })
    return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      requireAdminSession(request.headers),
      request.json() as Promise<unknown>,
    ])
    const data = await createWork({
      actor: session.user,
      ...sanitizeWorkInput(body),
      idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
    })
    return wonderlandSuccess(data, '作品已创建', 201)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

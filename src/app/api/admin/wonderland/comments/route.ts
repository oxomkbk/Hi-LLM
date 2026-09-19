import { requireAdminSession } from '@/lib/auth/session'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { listAdminWonderComments } from '@/lib/wonderland/repositories/admin'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const pageIndex = Math.max(0, Number(request.nextUrl.searchParams.get('pageIndex') || 0))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20)))
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100) || undefined
    const rawVisibility = request.nextUrl.searchParams.get('visibility')
    const visibility = rawVisibility === 'visible' || rawVisibility === 'hidden' || rawVisibility === 'deleted' ? rawVisibility : undefined
    const rawTargetType = request.nextUrl.searchParams.get('targetType')
    const targetType = rawTargetType === 'answer' || rawTargetType === 'news' || rawTargetType === 'question' ? rawTargetType : undefined
    const result = await listAdminWonderComments({
      limit: pageSize,
      offset: pageIndex * pageSize,
      q,
      targetType,
      visibility,
    })
    return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}

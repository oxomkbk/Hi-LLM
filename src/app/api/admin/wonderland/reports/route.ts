import { requireAdminSession } from '@/lib/auth/session'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { listAdminWonderReports } from '@/lib/wonderland/repositories/admin'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const pageIndex = Math.max(0, Number(request.nextUrl.searchParams.get('pageIndex') || 0))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20)))
    const rawStatus = request.nextUrl.searchParams.get('status')
    const status = rawStatus && ['pending', 'reviewing', 'resolved', 'dismissed'].includes(rawStatus) ? rawStatus : undefined
    const result = await listAdminWonderReports({ limit: pageSize, offset: pageIndex * pageSize, status })
    return wonderlandSuccess({ ...result, page: pageIndex + 1, pageIndex, pageSize })
  }
  catch (error) { return wonderlandErrorResponse(error) }
}

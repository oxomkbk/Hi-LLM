import { NextResponse } from 'next/server'

import { listAdminContent } from '@/lib/admin/content-center'
import { requireAdminSession } from '@/lib/auth/session'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type {
  AdminContentSecurityFilter,
  AdminContentStatus,
  AdminContentType,
} from '@/lib/admin/content-center.shared'
import type { NextRequest } from 'next/server'

const CONTENT_TYPES = new Set<AdminContentType>(['mcp', 'prompt', 'skill'])
const CONTENT_STATUSES = new Set<AdminContentStatus>(['archived', 'draft', 'published'])
const SECURITY_FILTERS = new Set<AdminContentSecurityFilter>(['active', 'all', 'attention', 'passed', 'unassessed'])

class AdminContentRequestError extends Error {}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const page = integer(params.get('page'), 1, 1, 100_000)
    const pageSize = integer(params.get('pageSize'), 24, 1, 100)
    const type = optionalEnum(params.get('type'), CONTENT_TYPES, '内容类型')
    const status = optionalEnum(params.get('status'), CONTENT_STATUSES, '内容状态')
    const security = optionalEnum(params.get('security'), SECURITY_FILTERS, '安全状态')
    const q = params.get('q')?.trim().slice(0, 100) || undefined

    const data = await listAdminContent({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      q,
      security,
      status,
      type,
    })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const status = error instanceof AdminContentRequestError
      ? 400
      : readErrorStatus(error) ?? 500
    const message = (status === 400 || status === 401 || status === 403) && error instanceof Error
      ? error.message
      : '内容中心加载失败'
    return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
  }
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new AdminContentRequestError('分页参数无效')
  return parsed
}

function optionalEnum<T extends string>(value: string | null, allowed: Set<T>, label: string): T | undefined {
  if (!value || value === 'all')
    return undefined
  if (!allowed.has(value as T))
    throw new AdminContentRequestError(`${label}筛选无效`)
  return value as T
}

function readErrorStatus(error: unknown) {
  if (typeof error !== 'object' || !error || !('status' in error))
    return undefined
  const status = Number(error.status)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined
}

import { NextResponse } from 'next/server'

import { isPublicCatalogSort } from '@/lib/catalog-sort'
import {
  MCP_CATEGORIES,
  MCP_CLIENTS,
  MCP_TRANSPORTS,
  sanitizeMcpSearchTerm,
} from '@/lib/mcps'
import { mcpRepository } from '@/lib/repositories/mcps'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

const PUBLIC_ERROR = 'MCP 目录暂时不可用，请先检查数据库配置或稍后重试'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const pageIndex = parseInteger(searchParams.get('pageIndex'), 0, 0, 10000)
    const pageSize = parseInteger(searchParams.get('pageSize'), 12, 1, 48)
    const q = sanitizeMcpSearchTerm(searchParams.get('q'))
    const category = searchParams.get('category')?.trim() || ''
    const client = searchParams.get('client')?.trim() || ''
    const transport = searchParams.get('transport')?.trim() || ''
    const featured = parseOptionalBoolean(searchParams.get('featured'))
    const sort = searchParams.get('sort') || 'latest'

    if (!isPublicCatalogSort(sort))
      return NextResponse.json(responseMessage(null, '排序方式无效', RESPONSE.ERROR), { status: 400 })

    if (category && !(MCP_CATEGORIES as readonly string[]).includes(category))
      return NextResponse.json(responseMessage(null, 'MCP 分类无效', RESPONSE.ERROR), { status: 400 })
    if (client && !(MCP_CLIENTS as readonly string[]).includes(client))
      return NextResponse.json(responseMessage(null, '兼容客户端无效', RESPONSE.ERROR), { status: 400 })
    if (transport && !(MCP_TRANSPORTS as readonly string[]).includes(transport))
      return NextResponse.json(responseMessage(null, '传输方式无效', RESPONSE.ERROR), { status: 400 })

    const start = pageIndex * pageSize
    const { list, total } = await mcpRepository.list({
      category: category || undefined,
      client: client || undefined,
      featured,
      limit: pageSize,
      offset: start,
      publishedOnly: true,
      q: q || undefined,
      sortMode: sort,
      transport: transport || undefined,
    })

    return NextResponse.json(responseMessage({ list, page: pageIndex + 1, pageSize, total }), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    const invalid = message === '分页参数无效' || message === '精选筛选参数无效'
    return NextResponse.json(responseMessage(null, invalid ? message : PUBLIC_ERROR, RESPONSE.ERROR), { status: invalid ? 400 : 503 })
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('分页参数无效')
  return parsed
}

function parseOptionalBoolean(value: string | null) {
  if (!value)
    return null
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error('精选筛选参数无效')
}

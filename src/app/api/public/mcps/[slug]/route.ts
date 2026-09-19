import { NextResponse } from 'next/server'

import { createMcpSlug } from '@/lib/mcps'
import { mcpRepository } from '@/lib/repositories/mcps'
import { RESPONSE, responseMessage } from '@/lib/utils'

const PUBLIC_ERROR = 'MCP 数据暂时不可用，请稍后重试'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: rawSlug } = await params
    const slug = createMcpSlug(rawSlug)
    if (slug !== rawSlug)
      return NextResponse.json(responseMessage(null, 'MCP 地址无效', RESPONSE.ERROR), { status: 400 })

    const mcp = await mcpRepository.findPublishedBySlug(slug)
    if (!mcp)
      return NextResponse.json(responseMessage(null, 'MCP Server 不存在', RESPONSE.ERROR), { status: 404 })

    const related = await mcpRepository.listRelated(mcp, 3)

    return NextResponse.json(responseMessage({ mcp, related }), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  }
  catch {
    return NextResponse.json(responseMessage(null, PUBLIC_ERROR, RESPONSE.ERROR), { status: 503 })
  }
}

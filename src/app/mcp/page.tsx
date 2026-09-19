import { readPublicCatalogSort } from '@/lib/catalog-sort'
import { MCP_CATEGORIES, MCP_CLIENTS, MCP_TRANSPORTS } from '@/lib/mcps'

import McpExplorer from './mcp-explorer'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `MCP Directory | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '发现、评估并接入公开的 Model Context Protocol Server，为 AI 客户端连接工具、数据与业务系统。',
  keywords: ['MCP', 'Model Context Protocol', 'MCP Server', 'AI Tools', 'Agent'],
  openGraph: {
    title: `MCP Directory | ${process.env.NEXT_PUBLIC_APP_NAME}`,
    description: '面向开发者和团队的 MCP Server 目录。',
    type: 'website',
  },
}

export default async function McpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const category = single(query.category)
  const client = single(query.client)
  const transport = single(query.transport)
  const page = Number(single(query.page))
  return (
    <McpExplorer
      initialCategory={(MCP_CATEGORIES as readonly string[]).includes(category) ? category : ''}
      initialClient={(MCP_CLIENTS as readonly string[]).includes(client) ? client : ''}
      initialFeatured={single(query.featured) === 'true'}
      initialPage={Number.isInteger(page) && page > 0 && page <= 10_001 ? page : 1}
      initialQuery={single(query.q).slice(0, 80)}
      initialSort={readPublicCatalogSort(single(query.sort))}
      initialTransport={(MCP_TRANSPORTS as readonly string[]).includes(transport) ? transport : ''}
    />
  )
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

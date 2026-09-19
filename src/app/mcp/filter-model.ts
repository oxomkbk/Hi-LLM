import type { PublicCatalogSort } from '@/lib/catalog-sort'

export interface McpListFilters {
  category: string
  client: string
  featured: boolean
  page: number
  q: string
  sort: PublicCatalogSort
  transport: string
}

export function buildMcpListHref({ category, client, featured, page, q, sort, transport }: McpListFilters) {
  const params = new URLSearchParams()
  if (q)
    params.set('q', q)
  if (category)
    params.set('category', category)
  if (transport)
    params.set('transport', transport)
  if (client)
    params.set('client', client)
  if (featured)
    params.set('featured', 'true')
  if (sort !== 'latest')
    params.set('sort', sort)
  if (page > 1)
    params.set('page', String(page))
  const search = params.toString()
  return search ? `/mcp?${search}` : '/mcp'
}

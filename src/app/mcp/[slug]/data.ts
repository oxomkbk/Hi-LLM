import { unstable_cache } from 'next/cache'

import { mcpRepository } from '@/lib/repositories/mcps'

export async function getPublicMcpDetail(slug: string) {
  return unstable_cache(async () => {
    const mcp = await mcpRepository.findPublishedBySlug(slug)
    if (!mcp)
      return null
    const related = await mcpRepository.listRelated(mcp, 3)
    return { mcp, related }
  }, ['mcp-detail', slug], { revalidate: 60, tags: ['mcps:public', `mcp:${slug}`] })()
}

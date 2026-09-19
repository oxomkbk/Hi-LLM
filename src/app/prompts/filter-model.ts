import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { PromptContentKind } from '@/types'

export interface PromptFilters {
  category: string
  featured: boolean
  kind: PromptContentKind | ''
  q: string
  sort: PublicCatalogSort
}

export interface PromptListState extends PromptFilters {
  page: number
}

export function buildPromptsListHref(filters: PromptListState) {
  const params = new URLSearchParams()
  if (filters.q)
    params.set('q', filters.q)
  if (filters.kind)
    params.set('kind', filters.kind)
  if (filters.category)
    params.set('category', filters.category)
  if (filters.featured)
    params.set('featured', 'true')
  if (filters.sort !== 'latest')
    params.set('sort', filters.sort)
  if (filters.page > 1)
    params.set('page', String(filters.page))
  const search = params.toString()
  return search ? `/prompts?${search}` : '/prompts'
}

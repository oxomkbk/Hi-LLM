import type { NavigationAiCandidate, NavigationAiMessage } from '@/lib/navigation-ai/types'

export const CATALOG_AI_SCOPES = ['navigation', 'skills', 'mcp', 'prompts', 'wonderland', 'works'] as const

export interface CatalogAiCandidate extends NavigationAiCandidate {
  external: boolean
  image: string | null
  kind: string
  searchText?: string
  scope: CatalogAiScope
}

export type CatalogAiMessage = NavigationAiMessage

export interface CatalogAiResponse {
  answer: string
  results: CatalogAiResultItem[]
  scope: CatalogAiScope
  suggestions: string[]
}

export interface CatalogAiResultItem {
  description: string
  external: boolean
  href: string
  id: string
  image: string | null
  kind: string
  meta: string[]
  title: string
  visitId: string | null
  vpn: boolean
}

export type CatalogAiScope = typeof CATALOG_AI_SCOPES[number]

export function isCatalogAiScope(value: unknown): value is CatalogAiScope {
  return typeof value === 'string' && (CATALOG_AI_SCOPES as readonly string[]).includes(value)
}

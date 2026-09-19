export const PUBLIC_CATALOG_SORTS = ['latest', 'recommended'] as const

export type PublicCatalogSort = typeof PUBLIC_CATALOG_SORTS[number]

export function isPublicCatalogSort(value: unknown): value is PublicCatalogSort {
  return typeof value === 'string' && (PUBLIC_CATALOG_SORTS as readonly string[]).includes(value)
}

export function readPublicCatalogSort(value: unknown): PublicCatalogSort {
  return value === 'recommended' ? 'recommended' : 'latest'
}

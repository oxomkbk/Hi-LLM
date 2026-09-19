export interface PaginationToken {
  key: string
  type: 'ellipsis' | 'page'
  value?: number
}

export function getPaginationTokens(page: number, totalPages: number): PaginationToken[] {
  const normalizedTotal = Math.max(1, Math.trunc(totalPages))
  const normalizedPage = normalizePage(page, normalizedTotal)
  const tokens: PaginationToken[] = []
  const start = Math.max(1, normalizedPage - 1)
  const end = Math.min(normalizedTotal, normalizedPage + 1)

  if (start > 1) {
    tokens.push({ key: 'page-1', type: 'page', value: 1 })
    if (start > 2)
      tokens.push({ key: 'ellipsis-start', type: 'ellipsis' })
  }
  for (let value = start; value <= end; value += 1)
    tokens.push({ key: `page-${value}`, type: 'page', value })
  if (end < normalizedTotal) {
    if (end < normalizedTotal - 1)
      tokens.push({ key: 'ellipsis-end', type: 'ellipsis' })
    tokens.push({ key: `page-${normalizedTotal}`, type: 'page', value: normalizedTotal })
  }
  return tokens
}

export function normalizePage(value: number, totalPages: number) {
  const normalizedTotal = Math.max(1, Math.trunc(totalPages))
  if (!Number.isFinite(value))
    return 1
  return Math.min(normalizedTotal, Math.max(1, Math.trunc(value)))
}

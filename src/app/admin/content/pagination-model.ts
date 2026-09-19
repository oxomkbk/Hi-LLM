export type PageItem = number | 'start-ellipsis' | 'end-ellipsis'

export function buildPageItems(currentPage: number, totalPages: number): PageItem[] {
  const total = Math.max(1, Math.floor(totalPages))
  const current = Math.min(total, Math.max(1, Math.floor(currentPage)))

  if (total <= 7)
    return range(1, total)

  if (current <= 4)
    return [...range(1, 5), 'end-ellipsis', total]

  if (current >= total - 3)
    return [1, 'start-ellipsis', ...range(total - 4, total)]

  return [1, 'start-ellipsis', current - 1, current, current + 1, 'end-ellipsis', total]
}

export function pageRange(currentPage: number, pageSize: number, totalItems: number) {
  if (totalItems <= 0)
    return { end: 0, start: 0 }

  const page = Math.max(1, Math.floor(currentPage))
  const size = Math.max(1, Math.floor(pageSize))
  const start = Math.min(totalItems, (page - 1) * size + 1)
  return { end: Math.min(totalItems, start + size - 1), start }
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

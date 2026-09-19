import type { WonderWorkKind, WonderWorkSort } from './domain'

export function buildWonderlandWorksPageHref(input: {
  kind?: WonderWorkKind
  page?: number
  q?: string
  sort?: WonderWorkSort
}) {
  const params = new URLSearchParams()
  if (input.kind)
    params.set('kind', input.kind)
  if (input.page && input.page > 1)
    params.set('page', String(input.page))
  if (input.q)
    params.set('q', input.q)
  if (input.sort && input.sort !== 'newest')
    params.set('sort', input.sort)
  const suffix = params.toString()
  return `${suffix ? `/wonderland/works?${suffix}` : '/wonderland/works'}#works-results`
}

import { describe, expect, it } from 'vitest'

import { buildMcpListHref } from './filter-model'

describe('mCP catalog filters', () => {
  it('keeps the featured-only selection in the shareable URL', () => {
    const href = buildMcpListHref({
      category: '',
      client: '',
      featured: true,
      page: 1,
      q: '',
      sort: 'latest',
      transport: '',
    })

    expect(href).toBe('/mcp?featured=true')
  })
})

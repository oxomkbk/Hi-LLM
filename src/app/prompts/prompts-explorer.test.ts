import { describe, expect, it } from 'vitest'

import { buildPromptsListHref } from './filter-model'

describe('prompts catalog filters', () => {
  it('keeps the featured-only selection in the shareable URL', () => {
    const href = buildPromptsListHref({
      category: '',
      featured: true,
      kind: '',
      page: 1,
      q: '',
      sort: 'latest',
    })

    expect(href).toBe('/prompts?featured=true')
  })
})

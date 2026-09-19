import { describe, expect, it } from 'vitest'

import { buildWonderlandWorksPageHref } from './works-pagination'

describe('wonderland works pagination links', () => {
  it('keeps search filters and targets the results region when moving forward', () => {
    expect(buildWonderlandWorksPageHref({
      kind: 'app',
      page: 3,
      q: 'canvas',
      sort: 'popular',
    })).toBe('/wonderland/works?kind=app&page=3&q=canvas&sort=popular#works-results')
  })

  it('omits the default page and sort from the first-page URL', () => {
    expect(buildWonderlandWorksPageHref({})).toBe('/wonderland/works#works-results')
  })
})

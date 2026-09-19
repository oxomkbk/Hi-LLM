import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import CatalogSortControls from './catalog-sort-controls'

describe('catalog sort controls', () => {
  it('describes recommended ordering without pretending to be a featured filter', () => {
    const markup = renderToStaticMarkup(<CatalogSortControls value="latest" onChange={() => {}} />)

    expect(markup).toContain('综合推荐')
    expect(markup).not.toContain('精选优先')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import AdminListPagination from './admin-list-pagination'

describe('admin list pagination', () => {
  it('renders the visible result range and available pages', () => {
    const markup = renderToStaticMarkup(
      <AdminListPagination
        loading={false}
        page={2}
        pageSize={20}
        total={41}
        onPageChange={vi.fn()}
      />,
    )

    expect(markup).toContain('第 21–40 条，共 41 条')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('>3<')
  })

  it('does not render page controls for an empty result', () => {
    const markup = renderToStaticMarkup(
      <AdminListPagination
        loading={false}
        page={1}
        pageSize={20}
        total={0}
        onPageChange={vi.fn()}
      />,
    )

    expect(markup).toBe('')
  })
})

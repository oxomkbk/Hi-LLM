import { describe, expect, it } from 'vitest'

import { formatAdminNumber, summarizeDashboardContent } from './admin-dashboard-view-model'

describe('admin dashboard view model', () => {
  it('separates directory content from website records', () => {
    const summary = summarizeDashboardContent([
      { archived: 2, draft: 3, id: 'skills', published: 100, total: 105 },
      { archived: 1, draft: 2, id: 'mcp', published: 200, total: 203 },
      { archived: 4, draft: 5, id: 'prompts', published: 300, total: 309 },
      { archived: 6, draft: 7, id: 'websites', published: 400, total: 413 },
    ])

    expect(summary.directory).toEqual({ archived: 7, draft: 10, published: 600, total: 617 })
    expect(summary.all).toEqual({ archived: 13, draft: 17, published: 1000, total: 1030 })
  })

  it('formats operational numbers for scanning', () => {
    expect(formatAdminNumber(1604)).toBe('1,604')
  })
})

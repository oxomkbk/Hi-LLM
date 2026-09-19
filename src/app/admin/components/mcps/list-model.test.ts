import { describe, expect, it } from 'vitest'

import { mcpAdminListHref, mcpAdminRequestParams } from './list-model'

describe('mcp admin list state', () => {
  it('builds canonical content URLs from zero-based API state', () => {
    expect(mcpAdminListHref('content', {
      pageIndex: 2,
      q: 'context',
      status: 'published',
    })).toBe('/admin/mcp/content?page=3&q=context&status=published')
  })

  it('uses the pending submission view as its default URL state', () => {
    expect(mcpAdminListHref('submissions', {
      pageIndex: 0,
      q: '',
      status: 'pending',
    })).toBe('/admin/mcp/submissions')
  })

  it('keeps the existing API parameter contract', () => {
    expect(mcpAdminRequestParams({
      pageIndex: 3,
      q: '  server  ',
      status: 'all',
    }, 20)).toEqual({
      pageIndex: 3,
      pageSize: 20,
      q: 'server',
      status: undefined,
    })
  })
})

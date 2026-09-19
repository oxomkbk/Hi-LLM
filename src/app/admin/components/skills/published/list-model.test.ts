import { describe, expect, it } from 'vitest'

import { skillAdminListHref, skillAdminRequestParams } from './list-model'

describe('skills admin list state', () => {
  it('keeps applied filters and page in the canonical list URL', () => {
    expect(skillAdminListHref({
      category: 'development',
      page: 3,
      q: 'codex',
      status: 'published',
    })).toBe('/admin/skills/content?category=development&page=3&q=codex&status=published')
  })

  it('omits default filters from the list URL', () => {
    expect(skillAdminListHref({
      category: 'all',
      page: 1,
      q: '',
      status: 'all',
    })).toBe('/admin/skills/content')
  })

  it('converts the public URL page to the existing zero-based API request', () => {
    expect(skillAdminRequestParams({
      category: 'development',
      page: 3,
      q: '  codex  ',
      status: 'published',
    }, 20)).toEqual({
      category: 'development',
      pageIndex: 2,
      pageSize: 20,
      q: 'codex',
      status: 'published',
    })
  })
})

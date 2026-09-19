import { describe, expect, it } from 'vitest'

import {
  buildAdminListHref,
  firstAdminParam,
  lastAdminPage,
  normalizeAdminPage,
  readAdminEnum,
  readAdminPage,
  readAdminQuery,
  shouldApplyAdminResponse,
} from './list-state'

describe('admin list URL state', () => {
  it('reads the first scalar search parameter', () => {
    expect(firstAdminParam(['first', 'second'])).toBe('first')
    expect(firstAdminParam('only')).toBe('only')
    expect(firstAdminParam(undefined)).toBeUndefined()
  })

  it('accepts only positive pages within the API limit', () => {
    expect(readAdminPage('3', 10_001)).toBe(3)
    expect(readAdminPage('0', 10_001)).toBe(1)
    expect(readAdminPage('-1', 10_001)).toBe(1)
    expect(readAdminPage('1.5', 10_001)).toBe(1)
    expect(readAdminPage('10002', 10_001)).toBe(1)
    expect(readAdminPage(['4', '8'], 10_001)).toBe(4)
  })

  it('normalizes queries with the page-specific API limit', () => {
    expect(readAdminQuery('  codex  ', 100)).toBe('codex')
    expect(readAdminQuery('x'.repeat(90), 80)).toBe('x'.repeat(80))
    expect(readAdminQuery(['  first  ', 'second'], 100)).toBe('first')
  })

  it('falls back when an enum parameter is unknown', () => {
    const allowed = ['all', 'published'] as const

    expect(readAdminEnum('published', allowed, 'all')).toBe('published')
    expect(readAdminEnum('unknown', allowed, 'all')).toBe('all')
    expect(readAdminEnum(['published', 'all'], allowed, 'all')).toBe('published')
  })

  it('builds a canonical URL and omits default values', () => {
    expect(buildAdminListHref('/admin/skills/content', {
      category: 'development',
      page: 3,
      q: 'codex',
      status: 'published',
    }, {
      category: 'all',
      page: 1,
      q: '',
      status: 'all',
    })).toBe('/admin/skills/content?category=development&page=3&q=codex&status=published')

    expect(buildAdminListHref('/admin/mcp/content', {
      page: 1,
      q: '',
      status: 'all',
    }, {
      page: 1,
      q: '',
      status: 'all',
    })).toBe('/admin/mcp/content')
  })

  it('encodes values without leaking hashes or duplicate separators', () => {
    expect(buildAdminListHref('/admin/prompts', {
      page: 2,
      q: 'AI Agent / RAG',
    }, {
      page: 1,
      q: '',
    })).toBe('/admin/prompts?page=2&q=AI+Agent+%2F+RAG')
  })
})

describe('admin list page correction', () => {
  it('calculates a stable final page for empty and partial pages', () => {
    expect(lastAdminPage(0, 20)).toBe(1)
    expect(lastAdminPage(1, 20)).toBe(1)
    expect(lastAdminPage(41, 20)).toBe(3)
  })

  it('clamps an invalid current page to the available result range', () => {
    expect(normalizeAdminPage(4, 41, 20)).toBe(3)
    expect(normalizeAdminPage(0, 41, 20)).toBe(1)
    expect(normalizeAdminPage(2, 0, 20)).toBe(1)
  })

  it('applies only the latest request result', () => {
    expect(shouldApplyAdminResponse(2, 3)).toBe(false)
    expect(shouldApplyAdminResponse(3, 3)).toBe(true)
  })
})

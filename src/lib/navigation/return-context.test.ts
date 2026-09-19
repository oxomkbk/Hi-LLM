import { describe, expect, it } from 'vitest'

import { buildContextualHref, returnTargetId, safeReturnTo } from './return-context'

describe('return navigation context', () => {
  it('carries list state and a stable card target into detail links', () => {
    expect(buildContextualHref('/skills/example', '/skills?page=3&q=writer', 'return-skill-42'))
      .toBe('/skills/example?returnTo=%2Fskills%3Fpage%3D3%26q%3Dwriter%23return-skill-42')
  })

  it('accepts only approved internal list routes', () => {
    const policy = { exactPathnames: ['/skills'] }
    expect(safeReturnTo('/skills?page=3#return-skill-42', '/skills', policy)).toBe('/skills?page=3#return-skill-42')
    expect(safeReturnTo('/mcp?page=3', '/skills', policy)).toBe('/skills')
    expect(safeReturnTo('https://evil.example/skills', '/skills', policy)).toBe('/skills')
    expect(safeReturnTo('//evil.example/skills', '/skills', policy)).toBe('/skills')
    expect(safeReturnTo('/skills\\@evil.example', '/skills', policy)).toBe('/skills')
  })

  it('supports approved route families without allowing sibling prefixes', () => {
    const policy = { exactPathnames: ['/account', '/wonderland'], pathnamePrefixes: ['/users'] }
    expect(safeReturnTo('/users/42?tab=questions', '/wonderland', policy)).toBe('/users/42?tab=questions')
    expect(safeReturnTo('/user-settings', '/wonderland', policy)).toBe('/wonderland')
  })

  it('preserves nested admin review routes inside an approved family', () => {
    const policy = { pathnamePrefixes: ['/admin/skills/submissions'] }
    const review = '/admin/skills/submissions/7ca9b5c0-78c4-4631-96e3-af4e44679aa4/review?returnTo=%2Fadmin%2Fskills%2Fsubmissions%3Fpage%3D3'
    expect(safeReturnTo(review, '/admin/security', policy)).toBe(review)
    expect(safeReturnTo('/admin/skills/content', '/admin/security', policy)).toBe('/admin/security')
  })

  it('normalizes return target ids', () => {
    expect(returnTargetId('wonderland question', 'abc/123')).toBe('return-wonderland-question-abc-123')
  })
})

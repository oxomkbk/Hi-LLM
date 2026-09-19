import { describe, expect, it } from 'vitest'

import { isEditorWorkspaceRoute, isProfileRoute } from './public-shell'

describe('isProfileRoute', () => {
  it.each(['/account', '/users/123', '/users/123/questions'])('matches %s', (pathname) => {
    expect(isProfileRoute(pathname)).toBe(true)
  })

  it.each(['/', '/accounting', '/accounts', '/users', '/admin/users', '/wonderland'])('does not match %s', (pathname) => {
    expect(isProfileRoute(pathname)).toBe(false)
  })
})

describe('isEditorWorkspaceRoute', () => {
  it.each([
    '/skills/submit',
    '/mcp/submit',
    '/prompts/submit',
    '/wonderland/ask',
    '/wonderland/works/new',
    '/admin/skills/new',
    '/admin/skills/skill-id/edit',
    '/admin/mcp/new',
    '/admin/mcp/server-id/edit',
    '/admin/wonderland/works/new',
    '/admin/wonderland/works/work-id/edit',
  ])('matches editor workspace %s', (pathname) => {
    expect(isEditorWorkspaceRoute(pathname)).toBe(true)
  })

  it.each([
    '/',
    '/skills',
    '/skills/example',
    '/wonderland/works',
    '/admin',
    '/admin/skills/content',
    '/admin/wonderland/works',
  ])('keeps the normal application shell for %s', (pathname) => {
    expect(isEditorWorkspaceRoute(pathname)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { nextAdminOpenGroups, parseAdminOpenGroups, resolveAdminOpenGroupsPreference } from './admin-navigation'

describe('admin navigation groups', () => {
  it('opens a group without collapsing groups that are already open', () => {
    const next = nextAdminOpenGroups(new Set(['WORKSPACE', 'CONTENT', 'SYSTEM']), 'TRUST')

    expect([...next]).toEqual(['WORKSPACE', 'CONTENT', 'SYSTEM', 'TRUST'])
  })

  it('collapses only the selected group', () => {
    const next = nextAdminOpenGroups(new Set(['WORKSPACE', 'CONTENT', 'SYSTEM']), 'CONTENT')

    expect([...next]).toEqual(['WORKSPACE', 'SYSTEM'])
  })

  it('restores every valid stored group and keeps the current group open', () => {
    const next = parseAdminOpenGroups(JSON.stringify(['CONTENT', 'SYSTEM', 'UNKNOWN']), 'TRUST')

    expect([...next]).toEqual(['WORKSPACE', 'CONTENT', 'SYSTEM', 'TRUST'])
  })

  it('falls back to the workspace and current group for malformed storage', () => {
    const next = parseAdminOpenGroups('{malformed', 'OPERATIONS')

    expect([...next]).toEqual(['WORKSPACE', 'CONTENT', 'OPERATIONS'])
  })

  it('persists groups discovered across consecutive route changes', () => {
    const trustRoute = resolveAdminOpenGroupsPreference(null, 'TRUST')
    const systemRoute = resolveAdminOpenGroupsPreference(trustRoute.serialized, 'SYSTEM')

    expect([...systemRoute.groups]).toEqual(['WORKSPACE', 'CONTENT', 'TRUST', 'SYSTEM'])
    expect(systemRoute.serialized).toBe('["WORKSPACE","CONTENT","TRUST","SYSTEM"]')
  })
})

import { describe, expect, it } from 'vitest'

import { parseProviderUrl } from './provider-url'

describe('security source provider URLs', () => {
  it('parses repository roots and explicit Skill subdirectories', () => {
    expect(parseProviderUrl('https://github.com/acme/skills/tree/main/review/code')).toEqual(expect.objectContaining({
      projectPath: 'acme/skills',
      provider: 'github',
      ref: 'main',
      subdirectory: 'review/code',
    }))
    expect(parseProviderUrl('https://gitlab.com/group/team/skills/-/tree/release/audit')).toEqual(expect.objectContaining({
      projectPath: 'group/team/skills',
      provider: 'gitlab',
      ref: 'release',
      subdirectory: 'audit',
    }))
  })

  it('rejects arbitrary hosts, credentials and non-tree content URLs', () => {
    expect(() => parseProviderUrl('https://example.com/acme/skills')).toThrowError(/SECURITY_SOURCE_NOT_ALLOWED/)
    expect(() => parseProviderUrl('https://user@github.com/acme/skills')).toThrowError(/SECURITY_SOURCE_NOT_ALLOWED/)
    expect(() => parseProviderUrl('https://github.com/acme/skills/blob/main/SKILL.md')).toThrowError(/SECURITY_SOURCE_NOT_ALLOWED/)
  })
})

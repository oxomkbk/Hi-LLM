import { describe, expect, it } from 'vitest'

import { skillCanonicalKey } from './skill-canonical'

describe('skillCanonicalKey', () => {
  it('allows different skills from the same Git repository', () => {
    const shared = {
      author_name: 'Vercel Labs',
      name: 'Find Skills',
      source_kind: 'git_repository' as const,
      source_url: 'https://github.com/vercel-labs/skills',
    }

    expect(skillCanonicalKey({
      ...shared,
      install_command: 'npx skills add https://github.com/vercel-labs/skills --skill find-skills',
    })).not.toBe(skillCanonicalKey({
      ...shared,
      install_command: 'npx skills add https://github.com/vercel-labs/skills --skill skill-creator',
    }))
  })

  it('continues to deduplicate external pages by URL', () => {
    const base = {
      author_name: 'Example',
      name: 'Example Skill',
      source_kind: 'external_page' as const,
      source_url: 'https://example.com/skill',
    }

    expect(skillCanonicalKey({ ...base, install_command: 'first' }))
      .toBe(skillCanonicalKey({ ...base, install_command: 'second' }))
  })
})

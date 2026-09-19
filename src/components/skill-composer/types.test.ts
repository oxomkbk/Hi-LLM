import { describe, expect, it } from 'vitest'

import { skillComposerPayload, skillToComposerValue } from './types'

import type { Skill } from '@/types'

describe('skill composer model', () => {
  it('preserves an administrator featured choice in the next save', () => {
    const source = createSkillFixture()
    const draft = skillToComposerValue(source)
    const payload = skillComposerPayload({ ...draft, featured: true })

    expect(draft.featured).toBe(true)
    expect(payload.featured).toBe(true)
  })
})

function createSkillFixture(): Skill {
  return {
    author_name: 'Example',
    author_url: null,
    category: '编程开发',
    created_at: '2026-08-22T00:00:00.000Z',
    description: '# Skill\n\nDescription',
    featured: true,
    homepage_url: null,
    icon: null,
    id: '00000000-0000-4000-8000-000000000001',
    install_command: null,
    license: 'MIT',
    name: 'Example Skill',
    platforms: ['Codex'],
    published_at: null,
    published_by: null,
    security_assessment: null,
    security_assessment_id: null,
    security_assessed_at: null,
    security_assessment_status: null,
    security_findings: [],
    security_grade: null,
    security_pending_reason: null,
    security_public_summary: null,
    security_recommendations: [],
    security_risk_count: 0,
    security_risk_level: null,
    slug: 'example-skill',
    sort: 1,
    source_kind: 'git_repository',
    source_url: 'https://github.com/example/skill',
    status: 'draft',
    summary: 'Example summary',
    tags: ['example'],
    updated_at: '2026-08-22T00:00:00.000Z',
    verified: false,
    version: '1.0.0',
  }
}

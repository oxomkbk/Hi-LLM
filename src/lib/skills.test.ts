import { describe, expect, it } from 'vitest'

import { createSkillSlug, sanitizeSkillAdminInput, sanitizeSkillInput } from './skills'

describe('skill input validation', () => {
  it('creates a stable fallback slug for Chinese names', () => {
    const first = createSkillSlug('中文技能')
    const second = createSkillSlug('中文技能')

    expect(first).toBe(second)
    expect(first).toMatch(/^skill-[0-9a-f]{8}$/)
    expect(createSkillSlug('另一个技能')).not.toBe(first)
  })

  it('accepts platform content without a source URL', () => {
    const skill = sanitizeSkillInput(skillInput({
      source_kind: 'platform_content',
      source_url: null,
    }))

    expect(skill.source_kind).toBe('platform_content')
    expect(skill.source_url).toBeNull()
  })

  it('infers legacy repository and external page sources', () => {
    const repository = sanitizeSkillInput(skillInput({
      source_kind: undefined,
      source_url: 'https://github.com/acme/demo',
    }))
    const page = sanitizeSkillInput(skillInput({
      source_kind: undefined,
      source_url: 'https://example.com/skills/demo',
    }))

    expect(repository.source_kind).toBe('git_repository')
    expect(page.source_kind).toBe('external_page')
  })

  it('does not allow repository URLs to be mislabeled as external pages', () => {
    expect(() => sanitizeSkillInput(skillInput({
      source_kind: 'external_page',
      source_url: 'https://github.com/acme/demo',
    }))).toThrowError(/请选择“Git 仓库”来源/)

    expect(() => sanitizeSkillInput(skillInput({
      source_kind: 'git_repository',
      source_url: 'https://example.com/skills/demo',
    }))).toThrowError(/Git 仓库来源仅支持/)
  })

  it('normalizes uploaded icons and keeps public HTTPS icons compatible', () => {
    const fileId = '123e4567-e89b-42d3-a456-426614174000'

    expect(sanitizeSkillInput(skillInput({ icon: `file:${fileId}` })).icon).toBe(`file:${fileId}`)
    expect(sanitizeSkillInput(skillInput({ icon: `/api/files/${fileId}` })).icon).toBe(`file:${fileId}`)
    expect(sanitizeSkillInput(skillInput({ icon: 'https://cdn.example.com/skill.png#preview' })).icon).toBe('https://cdn.example.com/skill.png')
    expect(() => sanitizeSkillInput(skillInput({ icon: 'file:not-a-file-id' }))).toThrowError(/Skill 图标文件引用格式无效/)
  })

  it('preserves an explicit featured choice from an administrator', () => {
    const result = sanitizeSkillAdminInput(skillInput({
      featured: true,
      sort: 99,
      status: 'draft',
      verified: false,
    }))

    expect(result.featured).toBe(true)
  })
})

function skillInput(overrides: Record<string, unknown> = {}) {
  return {
    author_name: '测试团队',
    category: '编程开发',
    description: '# 说明\n\n一个可复用的 Skill。',
    name: '中文技能',
    platforms: ['Codex'],
    source_kind: 'platform_content',
    source_url: null,
    summary: '用于验证 Skill 投稿流程。',
    tags: ['测试'],
    ...overrides,
  }
}

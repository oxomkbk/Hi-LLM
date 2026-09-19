import { describe, expect, it } from 'vitest'

import { createPromptSlug, sanitizePromptAdminInput, sanitizePromptSearchTerm, sanitizePromptSubmissionInput } from './prompts'

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'

describe('prompt input validation', () => {
  it('normalizes slugs and search text', () => {
    expect(createPromptSlug(' SaaS Dashboard UI ')).toBe('saas-dashboard-ui')
    expect(sanitizePromptSearchTerm('  dashboard<script> #dark  ')).toBe('dashboard script #dark')
  })

  it('requires a primary prompt before publishing', () => {
    expect(() => sanitizePromptAdminInput(baseInput({ status: 'published' }))).toThrow('发布前必须设置一份主提示词')
  })

  it('accepts a categorized draft with structured documents', () => {
    const result = sanitizePromptAdminInput(baseInput({
      documents: [{
        content: 'Create a restrained editorial dashboard.',
        isPrimary: true,
        language: 'markdown',
        name: 'Prompt',
        role: 'prompt',
        sourcePath: 'prompts/prompt.md',
      }],
    }))
    expect(result.primaryCategoryId).toBe(CATEGORY_ID)
    expect(result.documents[0]?.isPrimary).toBe(true)
  })

  it('preserves an explicit featured choice from an administrator', () => {
    const result = sanitizePromptAdminInput(baseInput({ featured: true }))

    expect(result.featured).toBe(true)
  })

  it('turns a community submission into a safe draft with a unique slug', () => {
    const result = sanitizePromptSubmissionInput(baseInput({
      featured: true,
      status: 'published',
      documents: [{
        content: 'Create a restrained editorial dashboard.',
        isPrimary: true,
        language: 'markdown',
        name: 'Prompt',
        role: 'prompt',
        sourcePath: 'prompts/prompt.md',
      }],
    }))
    expect(result.featured).toBe(false)
    expect(result.status).toBe('draft')
    expect(result.slug).toMatch(/^dashboard-ui-[a-f0-9]{6}$/)
  })

  it('requires a main document for community submissions', () => {
    expect(() => sanitizePromptSubmissionInput(baseInput())).toThrow('请填写主提示词')
  })
})

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    categoryIds: [CATEGORY_ID],
    compatibility: ['Next.js'],
    contentKind: 'web_ui',
    documents: [],
    featured: false,
    primaryCategoryId: CATEGORY_ID,
    slug: 'dashboard-ui',
    sort: 1,
    status: 'draft',
    summary: 'A reusable dashboard prompt.',
    tags: ['dashboard'],
    title: 'Dashboard UI',
    ...overrides,
  }
}

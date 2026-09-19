import { describe, expect, it } from 'vitest'

import { sanitizeNewsInput } from './validation'

const EMPTY_DOCUMENT = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}

const BASE_INPUT = {
  categoryId: '00000000-0000-4000-8000-000000000001',
  content: EMPTY_DOCUMENT,
  summary: '',
  title: '',
}

describe('wonderland news draft validation', () => {
  it('accepts an incomplete but structurally valid draft', () => {
    const result = sanitizeNewsInput({ ...BASE_INPUT, status: 'draft' })

    expect(result.status).toBe('draft')
    expect(result.title).toBe('')
    expect(result.summary).toBe('')
    expect(result.content.text).toBe('')
  })

  it('keeps the complete-content requirement when publishing', () => {
    expect(() => sanitizeNewsInput({ ...BASE_INPUT, status: 'published' })).toThrow(/正文不能少于|新闻摘要不能少于|新闻标题不能少于/)
  })
})

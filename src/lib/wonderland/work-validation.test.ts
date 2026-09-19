import { describe, expect, it } from 'vitest'

import { normalizeExternalWorkUrl, sanitizeWorkInput, workModerationTransition } from './work-validation'

const CONTENT = {
  content: [{ content: [{ text: '这是一个真实可运行的代码作品，正文会介绍使用方式、实现过程和后续计划。', type: 'text' as const }], type: 'paragraph' as const }],
  schema: 'wonderland-document' as const,
  version: 1 as const,
}

describe('wonderland work validation', () => {
  it('models reversible moderation transitions for every work visibility', () => {
    expect(workModerationTransition('hide', 'visible')).toEqual({ nextVisibility: 'hidden', deletedAt: null })
    expect(workModerationTransition('restore', 'hidden')).toEqual({ nextVisibility: 'visible', deletedAt: null })
    expect(workModerationTransition('restore', 'deleted')).toEqual({ nextVisibility: 'visible', deletedAt: null })
    expect(workModerationTransition('delete', 'visible')).toEqual({ nextVisibility: 'deleted', deletedAt: 'now' })
  })

  it('accepts a public external source and normalizes metadata', () => {
    const result = sanitizeWorkInput({
      content: CONTENT,
      coverFileId: 'c53b8134-1935-42ca-9c28-b4c10fd532f2',
      demoUrl: 'https://demo.example.com/app#preview',
      kind: 'app',
      sourceUrl: 'https://github.com/example/project#readme',
      summary: '这是一个可以公开体验并继续协作的社区代码作品。',
      tags: ['Next.js', '开源', 'Next.js'],
      title: 'Local Canvas',
    })

    expect(result.sourceUrl).toBe('https://github.com/example/project')
    expect(result.demoUrl).toBe('https://demo.example.com/app')
    expect(result.tags).toEqual(['Next.js', '开源'])
    expect(result.content.text.length).toBeGreaterThanOrEqual(30)
  })

  it.each([
    'http://example.com/file.zip',
    'https://localhost/project',
    'https://127.0.0.1/project',
    'https://10.0.0.8/project',
    'https://user:secret@example.com/project',
  ])('rejects unsafe or non-HTTPS work links: %s', (url) => {
    expect(() => normalizeExternalWorkUrl(url, '作品地址')).toThrow(/公开访问的 HTTPS 外链/)
  })

  it('requires a valid hosted cover and a supported work kind', () => {
    expect(() => sanitizeWorkInput({
      content: CONTENT,
      coverFileId: '',
      kind: 'archive',
      sourceUrl: 'https://github.com/example/project',
      summary: '这是一个可以公开体验并继续协作的社区代码作品。',
      tags: [],
      title: 'Local Canvas',
    })).toThrow()
  })
})

import { describe, expect, it } from 'vitest'

import { buildPromptEditorDocuments, createPromptEditorDocuments } from './prompt-editor-documents'

import type { PromptDetail, PromptDocument } from '@/types'

function document(overrides: Partial<PromptDocument>): PromptDocument {
  return {
    content: 'content',
    created_at: '2026-08-25',
    id: crypto.randomUUID(),
    is_primary: false,
    language: 'text',
    name: 'Document',
    prompt_id: crypto.randomUUID(),
    role: 'other',
    sort: 0,
    source_path: 'extra/document.txt',
    updated_at: '2026-08-25',
    ...overrides,
  }
}

describe('prompt editor documents', () => {
  it('preserves metadata, order, and unrecognized duplicate roles', () => {
    const original = [
      document({ content: '{"kind":"development-terminology"}', is_primary: true, language: 'prompt-glossary+json', name: '术语表达', role: 'prompt', source_path: 'GLOSSARY.json' }),
      document({ content: '{"schemaVersion":1,"items":[]}', language: 'prompt-glossary-preview+json', name: '术语预览', role: 'example', sort: 1, source_path: 'PREVIEWS.json' }),
      document({ content: '.preview-root{}', language: 'css', name: '术语预览样式', role: 'style', sort: 2, source_path: 'styles/glossary-preview.css' }),
      document({ content: 'keep me', language: 'css', name: 'Extra Style', role: 'style', sort: 3, source_path: 'styles/extra.css' }),
      document({ content: 'keep example', language: 'html', name: 'Extra Example', role: 'example', sort: 4, source_path: 'examples/extra.html' }),
    ]
    const editor = createPromptEditorDocuments({ documents: original } as PromptDetail)
    editor.glossaryPreview = '{"schemaVersion":1,"items":[{"termId":"table"}]}'
    const result = buildPromptEditorDocuments(editor, original)

    expect(result.map(item => item.sourcePath)).toEqual(original.map(item => item.source_path))
    expect(result[0]).toEqual(expect.objectContaining({ language: 'prompt-glossary+json', name: '术语表达', sourcePath: 'GLOSSARY.json' }))
    expect(result[1]?.content).toContain('"table"')
    expect(result[3]).toEqual(expect.objectContaining({ content: 'keep me', name: 'Extra Style', sourcePath: 'styles/extra.css' }))
    expect(result[4]).toEqual(expect.objectContaining({ content: 'keep example', name: 'Extra Example', sourcePath: 'examples/extra.html' }))
  })
})

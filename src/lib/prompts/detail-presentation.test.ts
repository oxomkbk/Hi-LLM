import { describe, expect, it } from 'vitest'

import {
  defaultPromptDocumentMode,
  getPromptDocumentPresentation,
  getPromptPreviewKind,
  promptDocumentLabel,
  resolvePromptDetailLayout,
  supportsPromptDocumentReading,
} from './detail-presentation'

import type { PromptAsset, PromptDocument } from '@/types'

function asset(overrides: Partial<PromptAsset> = {}): PromptAsset {
  return {
    alt_text: null,
    created_at: '2026-08-25T00:00:00.000Z',
    file_id: 'file-1',
    id: 'asset-1',
    import_id: null,
    is_downloadable: false,
    is_entrypoint: false,
    is_primary: false,
    metadata: {},
    mime_type: 'image/png',
    name: 'preview.png',
    origin: 'direct_upload',
    poster_asset_id: null,
    prompt_id: 'prompt-1',
    role: 'image',
    size_bytes: '1024',
    sort: 0,
    source_path: 'preview.png',
    updated_at: '2026-08-25T00:00:00.000Z',
    url: '/api/public/prompts/example/assets/asset-1',
    ...overrides,
  }
}

function document(overrides: Partial<PromptDocument> = {}): PromptDocument {
  return {
    content: '# 使用方法',
    created_at: '2026-08-25T00:00:00.000Z',
    id: 'document-1',
    is_primary: false,
    language: 'markdown',
    name: 'README.md',
    prompt_id: 'prompt-1',
    role: 'readme',
    sort: 0,
    source_path: 'README.md',
    updated_at: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('prompt detail presentation', () => {
  it('uses visual-first for media-oriented prompts with previews', () => {
    expect(resolvePromptDetailLayout('web_ui', true)).toBe('visual-first')
    expect(resolvePromptDetailLayout('image', true)).toBe('visual-first')
    expect(resolvePromptDetailLayout('video', true)).toBe('visual-first')
  })

  it('uses instruction-first for adaptation prompts and content without previews', () => {
    expect(resolvePromptDetailLayout('adaptation', true)).toBe('instruction-first')
    expect(resolvePromptDetailLayout('web_ui', false)).toBe('instruction-first')
  })

  it('gives document roles distinct reading semantics', () => {
    expect(getPromptDocumentPresentation(document({ role: 'prompt' })).tone).toBe('instruction')
    expect(getPromptDocumentPresentation(document({ role: 'negative_prompt' })).tone).toBe('negative')
    expect(getPromptDocumentPresentation(document({ role: 'parameters' })).tone).toBe('technical')
    expect(getPromptDocumentPresentation(document({ role: 'readme' })).tone).toBe('reading')
  })

  it('keeps technical documents in source mode even when named markdown', () => {
    const style = document({ role: 'style', language: 'markdown', source_path: 'style.md' })
    expect(supportsPromptDocumentReading(style)).toBe(false)
    expect(defaultPromptDocumentMode(style)).toBe('source')
  })

  it('reads prose documents and labels named supplemental documents', () => {
    expect(defaultPromptDocumentMode(document())).toBe('reading')
    expect(promptDocumentLabel(document({ name: '边界案例', role: 'other' }))).toBe('边界案例')
    expect(promptDocumentLabel(document({ is_primary: false, name: '移动端版本', role: 'prompt' }))).toBe('移动端版本')
  })

  it('rejects conflicting preview roles and mime types', () => {
    expect(getPromptPreviewKind(asset())).toBe('image')
    expect(getPromptPreviewKind(asset({ role: 'cover', mime_type: 'video/mp4' }))).toBeNull()
    expect(getPromptPreviewKind(asset({ role: 'video', mime_type: 'video/mp4' }))).toBe('video')
    expect(getPromptPreviewKind(asset({ role: 'video', mime_type: 'image/png' }))).toBeNull()
    expect(getPromptPreviewKind(asset({ role: 'attachment' }))).toBeNull()
    expect(getPromptPreviewKind(asset({ url: undefined }))).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PromptDocument } from '@/types'

const mocks = vi.hoisted(() => ({ findPublishedDocument: vi.fn() }))

vi.mock('@/lib/repositories/prompts', () => ({
  promptRepository: { findPublishedDocument: mocks.findPublishedDocument },
}))
vi.mock('@/lib/prompts', () => ({
  createPromptSlug: (value: unknown) => typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : '',
}))
vi.mock('@/lib/prompts/glossary', () => ({
  PROMPT_GLOSSARY_LANGUAGE: 'prompt-glossary+json',
}))
vi.mock('@/lib/prompts/glossary-preview', () => ({
  isGlossaryPreviewDocument: (document: PromptDocument) => document.role === 'example' && document.language === 'text/html',
  isGlossaryPreviewStyleDocument: (document: PromptDocument) => document.role === 'style',
}))
vi.mock('@/lib/prompts/http', () => ({
  promptSuccess: (data: unknown, message: string, status: number, headers?: HeadersInit) => Response.json({ data, msg: message }, { headers, status }),
}))

const { GET } = await import('./route')

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111'

function document(overrides: Partial<PromptDocument> = {}): PromptDocument {
  return {
    content: 'Create a clear dashboard.',
    created_at: '2026-08-25T00:00:00.000Z',
    id: DOCUMENT_ID,
    is_primary: true,
    language: 'markdown',
    name: 'Prompt.md',
    prompt_id: '22222222-2222-4222-8222-222222222222',
    role: 'prompt',
    sort: 0,
    source_path: 'PROMPT.md',
    updated_at: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('public prompt document route', () => {
  beforeEach(() => mocks.findPublishedDocument.mockReset())

  it('returns one published non-reserved document', async () => {
    mocks.findPublishedDocument.mockResolvedValue(document())
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ documentId: DOCUMENT_ID, slug: 'dashboard-prompt' }) })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.data.content).toBe('Create a clear dashboard.')
    expect(response.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('does not expose reserved glossary documents', async () => {
    mocks.findPublishedDocument.mockResolvedValue(document({ language: 'prompt-glossary+json' }))
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ documentId: DOCUMENT_ID, slug: 'dashboard-prompt' }) })
    const payload = await response.json()
    expect(response.status).toBe(404)
    expect(payload.data).toBeNull()
  })

  it('rejects invalid identifiers before querying the repository', async () => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ documentId: 'not-a-uuid', slug: 'Dashboard Prompt' }) })
    expect(response.status).toBe(400)
    expect(mocks.findPublishedDocument).not.toHaveBeenCalled()
  })
})

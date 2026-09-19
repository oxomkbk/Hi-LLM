import { describe, expect, it } from 'vitest'

import {
  buildPromptListParams,
  createPromptSearchState,
  promptAdminListHref,
  resetPromptSearch,
  submitPromptSearch,
  updatePromptSearchDraft,
} from './prompt-search-model'

describe('prompt search state', () => {
  it('keeps the submitted query unchanged while the user types', () => {
    const initial = createPromptSearchState('')
    const typed = updatePromptSearchDraft(initial, 'codex assistant')

    expect(typed).toEqual({ draft: 'codex assistant', query: '' })
    expect(buildPromptListParams({ kind: 'all', origin: 'all', page: 1, pageSize: 20, query: typed.query, status: 'all' })).toEqual({
      kind: '',
      origin: '',
      pageIndex: 0,
      pageSize: 20,
      q: '',
      status: '',
    })
  })

  it('submits one trimmed keyword value for requests', () => {
    const typed = updatePromptSearchDraft(createPromptSearchState(''), '  codex assistant  ')

    expect(submitPromptSearch(typed)).toEqual({ draft: '  codex assistant  ', query: 'codex assistant' })
  })

  it('clears both the draft and submitted keyword when reset', () => {
    const state = { draft: 'codex', query: 'codex' }

    expect(resetPromptSearch(state)).toEqual({ draft: '', query: '' })
  })

  it('converts URL pages to zero-based API pages', () => {
    expect(buildPromptListParams({
      kind: 'text',
      origin: 'community',
      page: 3,
      pageSize: 20,
      query: 'codex',
      status: 'draft',
    })).toEqual({
      kind: 'text',
      origin: 'community',
      pageIndex: 2,
      pageSize: 20,
      q: 'codex',
      status: 'draft',
    })
  })

  it('builds canonical prompt list URLs', () => {
    expect(promptAdminListHref({
      kind: 'text',
      origin: 'community',
      page: 3,
      query: 'codex',
      status: 'draft',
    })).toBe('/admin/prompts?kind=text&origin=community&page=3&q=codex&status=draft')
  })
})

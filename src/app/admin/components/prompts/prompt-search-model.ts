import { buildAdminListHref } from '../../../../lib/admin/list-state'

export interface PromptAdminListFilters {
  kind: string
  origin: string
  page: number
  query: string
  status: string
}

export interface PromptSearchState {
  draft: string
  query: string
}

interface PromptListRequestFilters extends PromptAdminListFilters {
  pageSize: number
}

export function buildPromptListParams({ kind, origin, page, pageSize, query, status }: PromptListRequestFilters) {
  return {
    kind: kind === 'all' ? '' : kind,
    origin: origin === 'all' ? '' : origin,
    pageIndex: Math.max(0, page - 1),
    pageSize,
    q: query.trim(),
    status: status === 'all' ? '' : status,
  }
}

export function createPromptSearchState(query: string): PromptSearchState {
  return { draft: query, query }
}

export function promptAdminListHref(filters: PromptAdminListFilters) {
  return buildAdminListHref('/admin/prompts', {
    kind: filters.kind,
    origin: filters.origin,
    page: filters.page,
    q: filters.query.trim(),
    status: filters.status,
  }, {
    kind: 'all',
    origin: 'all',
    page: 1,
    q: '',
    status: 'all',
  })
}

export function resetPromptSearch(state: PromptSearchState): PromptSearchState {
  return state.draft === '' && state.query === '' ? state : { draft: '', query: '' }
}

export function submitPromptSearch(state: PromptSearchState): PromptSearchState {
  return { ...state, query: state.draft.trim() }
}

export function updatePromptSearchDraft(state: PromptSearchState, draft: string): PromptSearchState {
  return { ...state, draft }
}

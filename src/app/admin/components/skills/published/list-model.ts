import { buildAdminListHref } from '../../../../../lib/admin/list-state'

import type { SkillStatus } from '../../../../../types'

export interface SkillAdminListFilters {
  category: string
  page: number
  q: string
  status: SkillStatus | 'all'
}

const DEFAULT_FILTERS: SkillAdminListFilters = {
  category: 'all',
  page: 1,
  q: '',
  status: 'all',
}

export function skillAdminListHref(filters: SkillAdminListFilters) {
  return buildAdminListHref('/admin/skills/content', {
    category: filters.category,
    page: filters.page,
    q: filters.q,
    status: filters.status,
  }, {
    category: DEFAULT_FILTERS.category,
    page: DEFAULT_FILTERS.page,
    q: DEFAULT_FILTERS.q,
    status: DEFAULT_FILTERS.status,
  })
}

export function skillAdminRequestParams(filters: SkillAdminListFilters, pageSize: number) {
  return {
    category: filters.category === 'all' ? '' : filters.category,
    pageIndex: Math.max(0, filters.page - 1),
    pageSize,
    q: filters.q.trim(),
    status: filters.status === 'all' ? '' : filters.status,
  }
}

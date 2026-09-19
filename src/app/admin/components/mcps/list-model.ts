import { buildAdminListHref } from '../../../../lib/admin/list-state'

export interface McpAdminListFilters {
  pageIndex: number
  q: string
  status: string
}

export type McpAdminMode = 'content' | 'submissions'

export function mcpAdminListHref(mode: McpAdminMode, filters: McpAdminListFilters) {
  const pathname = `/admin/mcp/${mode}`
  const defaultStatus = mode === 'content' ? 'all' : 'pending'

  return buildAdminListHref(pathname, {
    page: Math.max(0, filters.pageIndex) + 1,
    q: filters.q.trim(),
    status: filters.status,
  }, {
    page: 1,
    q: '',
    status: defaultStatus,
  })
}

export function mcpAdminRequestParams(filters: McpAdminListFilters, pageSize: number) {
  return {
    pageIndex: Math.max(0, filters.pageIndex),
    pageSize,
    q: filters.q.trim(),
    status: filters.status === 'all' ? undefined : filters.status,
  }
}

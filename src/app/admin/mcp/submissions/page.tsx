import { readAdminEnum, readAdminPage, readAdminQuery } from '@/lib/admin/list-state'

import McpAdminWorkspace from '../../components/mcps/mcp-admin-workspace'

const STATUSES = ['all', 'approved', 'pending', 'pending_security', 'rejected'] as const

export default async function AdminMcpSubmissionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <McpAdminWorkspace
      initialFilters={{
        pageIndex: readAdminPage(params.page, 10_001) - 1,
        q: readAdminQuery(params.q, 80),
        status: readAdminEnum(params.status, STATUSES, 'pending'),
      }}
      mode="submissions"
    />
  )
}

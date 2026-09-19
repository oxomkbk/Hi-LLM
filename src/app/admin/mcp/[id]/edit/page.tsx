import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminMcpComposerPage from '../../../components/mcps/composer/admin-mcp-composer-page'

export default async function AdminEditMcpPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/mcp/content', {
    exactPathnames: ['/admin/content', '/admin/mcp/content'],
  })
  return <AdminMcpComposerPage mcpId={id} returnHref={returnHref} />
}

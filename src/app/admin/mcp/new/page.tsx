import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminMcpComposerPage from '../../components/mcps/composer/admin-mcp-composer-page'

export default async function AdminNewMcpPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const query = await searchParams
  const returnHref = safeReturnTo(query.returnTo, '/admin/mcp/content', {
    exactPathnames: ['/admin/content', '/admin/mcp/content'],
  })
  return <AdminMcpComposerPage returnHref={returnHref} />
}

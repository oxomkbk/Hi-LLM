import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminMcpReviewPage from '../../../../components/mcps/composer/admin-mcp-review-page'

export default async function AdminMcpSubmissionReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/mcp/submissions', {
    exactPathnames: ['/admin/mcp/submissions'],
  })
  return <AdminMcpReviewPage returnHref={returnHref} submissionId={id} />
}

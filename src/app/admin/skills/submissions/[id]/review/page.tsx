import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminSkillReviewPage from '../../../../components/skills/composer/admin-skill-review-page'

export default async function AdminSkillSubmissionReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/skills/submissions', {
    exactPathnames: ['/admin/skills/submissions'],
  })
  return <AdminSkillReviewPage returnHref={returnHref} submissionId={id} />
}

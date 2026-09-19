import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminSkillComposerPage from '../../../components/skills/composer/admin-skill-composer-page'

export default async function AdminEditSkillPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/skills/content', {
    exactPathnames: ['/admin/content', '/admin/skills/content'],
  })
  return <AdminSkillComposerPage returnHref={returnHref} skillId={id} />
}

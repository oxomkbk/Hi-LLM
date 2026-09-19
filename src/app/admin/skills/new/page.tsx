import { safeReturnTo } from '@/lib/navigation/return-context'

import AdminSkillComposerPage from '../../components/skills/composer/admin-skill-composer-page'

export default async function AdminNewSkillPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const query = await searchParams
  const returnHref = safeReturnTo(query.returnTo, '/admin/skills/content', {
    exactPathnames: ['/admin/content', '/admin/skills/content'],
  })
  return <AdminSkillComposerPage returnHref={returnHref} />
}

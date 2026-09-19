import { readAdminEnum, readAdminPage, readAdminQuery } from '@/lib/admin/list-state'
import { SKILL_CATEGORIES } from '@/lib/skills'

import PublishedSkills from '../../components/skills/published'

const STATUSES = ['all', 'archived', 'draft', 'published'] as const
const CATEGORIES = ['all', ...SKILL_CATEGORIES] as const

export default async function AdminSkillsContentPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <PublishedSkills
      initialFilters={{
        category: readAdminEnum(params.category, CATEGORIES, 'all'),
        page: readAdminPage(params.page, 10_001),
        q: readAdminQuery(params.q, 100),
        status: readAdminEnum(params.status, STATUSES, 'all'),
      }}
    />
  )
}

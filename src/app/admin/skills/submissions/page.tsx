import SkillSubmissions from '../../components/skills/submissions'

const STATUSES = new Set(['all', 'approved', 'pending', 'pending_security', 'rejected'])

export default async function AdminSkillSubmissionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawStatus = firstValue(params.status)
  return (
    <SkillSubmissions
      initialFilters={{
        pageIndex: pageIndex(firstValue(params.page)),
        q: firstValue(params.q)?.slice(0, 100) ?? '',
        status: rawStatus && STATUSES.has(rawStatus) ? rawStatus as 'all' | 'approved' | 'pending' | 'pending_security' | 'rejected' : 'pending',
      }}
    />
  )
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageIndex(value?: string) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page - 1 : 0
}

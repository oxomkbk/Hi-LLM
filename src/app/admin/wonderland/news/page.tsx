import WonderlandNewsManager from '../../components/wonderland/news-manager'

const STATUSES = new Set(['', 'archived', 'draft', 'published', 'scheduled'])

export default async function AdminWonderlandNewsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const status = firstValue(params.status) ?? ''
  return (
    <WonderlandNewsManager
      initialFilters={{
        pageIndex: pageIndex(firstValue(params.page)),
        q: firstValue(params.q)?.slice(0, 100) ?? '',
        status: STATUSES.has(status) ? status : '',
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

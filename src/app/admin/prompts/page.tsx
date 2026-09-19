import { readAdminEnum, readAdminPage, readAdminQuery } from '@/lib/admin/list-state'
import { safeReturnTo } from '@/lib/navigation/return-context'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'

import { promptAdminListHref } from '../components/prompts/prompt-search-model'
import PromptsConsole from '../components/prompts/prompts-console'

const KINDS = ['all', ...PROMPT_CONTENT_KINDS.map(item => item.value)] as const
const ORIGINS = ['all', 'admin', 'community'] as const
const STATUSES = ['all', 'archived', 'draft', 'published'] as const

export default async function AdminPromptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const edit = firstValue(params.edit)?.trim()
  const initialFilters = {
    kind: readAdminEnum(params.kind, KINDS, 'all'),
    origin: readAdminEnum(params.origin, ORIGINS, 'all'),
    page: readAdminPage(params.page, 100_001),
    query: readAdminQuery(params.q, 100),
    status: readAdminEnum(params.status, STATUSES, 'all'),
  }
  const listHref = promptAdminListHref(initialFilters)
  const returnHref = edit
    ? safeReturnTo(params.returnTo, listHref, {
        exactPathnames: ['/admin/content', '/admin/prompts'],
      })
    : undefined
  return (
    <PromptsConsole
      initialFilters={initialFilters}
      requestedCreate={firstValue(params.create) === '1'}
      requestedEditId={edit || undefined}
      requestedReturnHref={returnHref}
    />
  )
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

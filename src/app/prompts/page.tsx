import { readPublicCatalogSort } from '@/lib/catalog-sort'
import { PROMPT_CONTENT_KINDS, PUBLIC_PROMPTS_PAGE_SIZE } from '@/lib/prompts'
import { promptRepository } from '@/lib/repositories/prompts'

import PromptsExplorer from './prompts-explorer'

import type { PromptFilters } from './filter-model'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Prompts 灵感库 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '发现可直接复用的网页 UI、图片、视频与适配 Prompts，预览效果并复制提示词、样式和文档。',
  keywords: ['Prompts', '网页 UI', '图片提示词', '视频提示词', 'AI 提示词'],
}

export default async function PromptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const requestedKind = readSingleValue(query.kind)
  const filters: PromptFilters = {
    category: readSingleValue(query.category).slice(0, 100),
    featured: readSingleValue(query.featured) === 'true',
    kind: PROMPT_CONTENT_KINDS.find(item => item.value === requestedKind)?.value ?? '',
    q: readSingleValue(query.q).slice(0, 100),
    sort: readPublicCatalogSort(readSingleValue(query.sort)),
  }
  const requestedPage = readPage(query.page)
  let initial = { categories: [], list: [], page: requestedPage, total: 0 } as Awaited<ReturnType<typeof loadInitial>>
  try {
    initial = await loadInitial(filters, requestedPage)
  }
  catch {}
  return <PromptsExplorer initialCategories={initial.categories} initialFilters={filters} initialPage={initial.page} initialPrompts={initial.list} initialTotal={initial.total} />
}

async function loadInitial(filters: PromptFilters, requestedPage: number) {
  const query = {
    category: filters.category || undefined,
    featured: filters.featured ? true : undefined,
    kind: filters.kind || undefined,
    limit: PUBLIC_PROMPTS_PAGE_SIZE,
    publishedOnly: true,
    q: filters.q || undefined,
    sortMode: filters.sort,
  }
  const [firstPage, categories] = await Promise.all([
    promptRepository.list({ ...query, offset: (requestedPage - 1) * PUBLIC_PROMPTS_PAGE_SIZE }),
    promptRepository.listCategories({ activeOnly: true }),
  ])
  let { list, total } = firstPage
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PUBLIC_PROMPTS_PAGE_SIZE)))
  if (page !== requestedPage)
    ({ list, total } = await promptRepository.list({ ...query, offset: (page - 1) * PUBLIC_PROMPTS_PAGE_SIZE }))
  return {
    categories,
    list: list.map(prompt => ({ ...prompt, cover_asset: prompt.cover_asset ? { ...prompt.cover_asset, url: `/api/public/prompts/${encodeURIComponent(prompt.slug)}/assets/${prompt.cover_asset.id}` } : null })),
    page,
    total,
  }
}

function readPage(value: string | string[] | undefined) {
  const parsed = Number(readSingleValue(value))
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1
}

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

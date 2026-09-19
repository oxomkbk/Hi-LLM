import { isPublicCatalogSort } from '@/lib/catalog-sort'
import { publicServerError } from '@/lib/http/public-error'
import { sanitizePromptSearchTerm } from '@/lib/prompts'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

import type { PromptContentKind } from '@/types'
import type { NextRequest } from 'next/server'

const KINDS = new Set<PromptContentKind>(['adaptation', 'image', 'video', 'web_ui'])

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const pageIndex = integer(params.get('pageIndex'), 0, 0, 100_000)
    const pageSize = integer(params.get('pageSize'), 18, 1, 50)
    const kind = params.get('kind') as PromptContentKind | null
    const sort = params.get('sort') || 'latest'
    if (!isPublicCatalogSort(sort))
      throw new Error('排序方式无效')
    if (kind && !KINDS.has(kind))
      throw new Error('内容类型无效')
    const { list, total } = await promptRepository.list({
      category: params.get('category') || undefined,
      featured: optionalBoolean(params.get('featured')),
      kind,
      limit: pageSize,
      offset: pageIndex * pageSize,
      publishedOnly: true,
      q: sanitizePromptSearchTerm(params.get('q')) || undefined,
      sortMode: sort,
    })
    return promptSuccess({ list: list.map(withAssetUrls), page: pageIndex + 1, pageSize, total }, 'Prompts 已加载', 200, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!['内容类型无效', '分页参数无效', '排序方式无效', '精选筛选无效'].includes(message)) {
      const failure = publicServerError(error, '公开 Prompts 目录加载失败')
      return promptErrorResponse(Object.assign(new Error(failure.message), {
        code: failure.code,
        retryable: failure.retryable,
        status: failure.status,
      }), failure.message)
    }
    return promptErrorResponse(error, 'Prompts 数据暂时不可用')
  }
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('分页参数无效')
  return parsed
}

function optionalBoolean(value: string | null) {
  if (!value)
    return null
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error('精选筛选无效')
}

function withAssetUrls<T extends { cover_asset: { id: string } | null, slug: string }>(prompt: T) {
  return { ...prompt, cover_asset: prompt.cover_asset ? { ...prompt.cover_asset, url: `/api/public/prompts/${encodeURIComponent(prompt.slug)}/assets/${prompt.cover_asset.id}` } : null }
}

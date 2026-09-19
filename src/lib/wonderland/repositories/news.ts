import 'server-only'

import { cache } from 'react'

import { queryBusiness } from '../../db/business'

import type { WonderCategory, WonderNewsDetail, WonderNewsListItem } from '../domain'

export interface PublicWonderlandNewsPage {
  list: WonderNewsListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface CountRow {
  total: string
}

export const findPublicWonderlandNewsBySlug = cache(async (slug: string): Promise<WonderNewsDetail | null> => {
  const result = await queryBusiness<WonderNewsDetail>(`
    select article.id, article.slug, article.title, article.summary,
           article.content_json, article.content_text, article.cover_file_id,
           article.featured, article.pinned, article.comment_count, article.published_at,
           article.seo_title, article.seo_description,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category,
           jsonb_build_object(
             'id', author.id,
             'name', coalesce(nullif(author.display_name, ''), '社区编辑'),
             'image', author.avatar_url
           ) as author
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    join public.app_users author on author.id = article.author_id
    where lower(article.slug) = lower($1)
      and article.status = 'published' and article.published_at <= now()
    limit 1
  `, [slug])
  return result.rows[0] ?? null
})

export async function listPublicWonderlandNewsCategories(): Promise<WonderCategory[]> {
  const result = await queryBusiness<WonderCategory>(`
    select id, scope, parent_id, depth, slug, name, description, icon,
           sort, is_active, created_at, updated_at
    from public.wonder_categories
    where scope = 'news' and is_active = true
    order by depth, sort desc, name, id
  `)
  return result.rows
}

export async function listPublicWonderlandNewsPage(input: {
  categorySlug?: string
  page?: number
  pageSize?: number
  q?: string
}): Promise<PublicWonderlandNewsPage> {
  const pageSize = clampInteger(input.pageSize, 12, 1, 48)
  const requestedPage = clampInteger(input.page, 1, 1, Number.MAX_SAFE_INTEGER)
  const categorySlug = input.categorySlug?.trim().slice(0, 100)
  const q = input.q?.trim().slice(0, 80)
  const conditions = [`article.status = 'published'`, `article.published_at <= now()`]
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }

  if (categorySlug) {
    add(parameter => `(
      category.slug = ${parameter}
      or category.parent_id = (
        select id from public.wonder_categories
        where scope = 'news' and slug = ${parameter}
        limit 1
      )
    )`, categorySlug)
  }
  if (q) {
    add(parameter => `(
      article.title ilike ${parameter}
      or article.summary ilike ${parameter}
      or article.content_text ilike ${parameter}
    )`, `%${escapeLike(q)}%`)
  }

  const where = conditions.join(' and ')
  const count = await queryBusiness<CountRow>(`
    select count(*)::text as total
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    where ${where}
  `, values)
  const total = Number(count.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const offset = (page - 1) * pageSize
  const listValues = [...values, pageSize, offset]
  const list = await queryBusiness<WonderNewsListItem>(`
    select article.id, article.slug, article.title, article.summary,
           article.cover_file_id, article.featured, article.pinned,
           article.comment_count, article.published_at,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    where ${where}
    order by article.published_at desc, article.id desc
    limit $${values.length + 1}
    offset $${values.length + 2}
  `, listValues)

  return { list: list.rows, page, pageSize, total, totalPages }
}

export async function listRecentPublicWonderlandNews(excludeSlug: string, limit = 5): Promise<WonderNewsListItem[]> {
  const result = await queryBusiness<WonderNewsListItem>(`
    select article.id, article.slug, article.title, article.summary,
           article.cover_file_id, article.featured, article.pinned, article.comment_count, article.published_at,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    where article.status = 'published' and article.published_at <= now()
      and lower(article.slug) <> lower($1)
    order by article.published_at desc, article.id desc
    limit $2
  `, [excludeSlug, Math.min(Math.max(limit, 1), 8)])
  return result.rows
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value))
    return fallback
  return Math.min(Math.max(Math.floor(value as number), min), max)
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

import 'server-only'

import { queryBusiness } from '@/lib/db/business'

import type { WonderWorkDetail, WonderWorkKind, WonderWorkListItem, WonderWorkSort } from '../domain'

const PUBLIC_AUTHOR_SQL = `jsonb_build_object(
  'id', author.id,
  'name', coalesce(nullif(author.display_name, ''), '社区用户'),
  'image', author.avatar_url
)`

const PUBLIC_WORK_COLUMNS = `
  work.id, work.slug, work.title, work.summary, work.kind, work.tags,
  work.source_url, work.demo_url, work.cover_file_id, work.featured,
  work.like_count, work.view_count, work.published_at,
  ${PUBLIC_AUTHOR_SQL} as author
`

export async function findPublicWorkBySlug(slug: string): Promise<WonderWorkDetail | null> {
  const result = await queryBusiness<WonderWorkDetail>(`
    select ${PUBLIC_WORK_COLUMNS}, work.content_json, work.content_text, work.updated_at
    from public.wonder_works work
    join public.app_users author on author.id = work.author_id
    where lower(work.slug) = lower($1) and work.visibility = 'visible'
    limit 1
  `, [slug])
  return result.rows[0] ?? null
}

export async function getWorkViewerState(workId: string, userId: string) {
  const result = await queryBusiness<{ liked: boolean }>(`
    select exists(
      select 1 from public.wonder_work_likes
      where work_id = $1::uuid and user_id = $2::uuid
    ) as liked
  `, [workId, userId])
  return { liked: result.rows[0]?.liked ?? false }
}

export async function listLatestPublicWorks(limit = 4) {
  const result = await queryBusiness<WonderWorkListItem>(`
    select ${PUBLIC_WORK_COLUMNS}
    from public.wonder_works work
    join public.app_users author on author.id = work.author_id
    where work.visibility = 'visible'
    order by work.featured desc, work.published_at desc, work.id desc
    limit $1
  `, [Math.min(12, Math.max(1, limit))])
  return result.rows
}

export async function listPublicWorkPage(input: {
  kind?: WonderWorkKind
  limit: number
  page?: number
  q?: string
  sort?: WonderWorkSort
}) {
  const conditions = [`work.visibility = 'visible'`]
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }
  if (input.kind)
    add(parameter => `work.kind = ${parameter}`, input.kind)
  if (input.q) {
    add(parameter => `(work.title ilike ${parameter} escape '\\' or work.summary ilike ${parameter} escape '\\' or exists (
      select 1 from unnest(work.tags) tag where tag ilike ${parameter} escape '\\'
    ))`, `%${escapeLike(input.q)}%`)
  }

  const count = await queryBusiness<{ total: string }>(`
    select count(*)::text as total
    from public.wonder_works work
    where ${conditions.join(' and ')}
  `, values)
  const total = Number(count.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / input.limit))
  const page = Math.min(totalPages, Math.max(1, input.page ?? 1))
  const orderBy = input.sort === 'popular'
    ? '(work.like_count * 5 + work.view_count) desc, work.published_at desc, work.id desc'
    : input.sort === 'liked'
      ? 'work.like_count desc, work.published_at desc, work.id desc'
      : 'work.featured desc, work.published_at desc, work.id desc'
  values.push(input.limit, (page - 1) * input.limit)
  const result = await queryBusiness<WonderWorkListItem>(`
    select ${PUBLIC_WORK_COLUMNS}
    from public.wonder_works work
    join public.app_users author on author.id = work.author_id
    where ${conditions.join(' and ')}
    order by ${orderBy}
    limit $${values.length - 1} offset $${values.length}
  `, values)

  return { list: result.rows, page, pageSize: input.limit, total, totalPages }
}

export async function listWorkSitemapRows() {
  const result = await queryBusiness<{ slug: string, updated_at: string }>(`
    select slug, updated_at from public.wonder_works
    where visibility = 'visible'
    order by updated_at desc limit 5000
  `)
  return result.rows
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

import 'server-only'

import { queryBusiness } from '../../db/business'

import type { WonderlandDocument } from '../content'
import type { WonderCategory, WonderNewsStatus } from '../domain'

export interface AdminWonderNewsDetail extends AdminWonderNewsItem {
  content_json: WonderlandDocument
}

export interface AdminWonderNewsItem {
  category: Pick<WonderCategory, 'id' | 'name' | 'slug'>
  category_id: string
  cover_file_id: string | null
  created_at: string
  featured: boolean
  id: string
  pinned: boolean
  published_at: string | null
  scheduled_at: string | null
  seo_description: string | null
  seo_title: string | null
  slug: string
  sort: number
  status: WonderNewsStatus
  summary: string
  title: string
  updated_at: string
}

export interface AdminWonderQuestionDetail {
  category_id: string
  content_json: WonderlandDocument
  id: string
  slug: string
  summary: string
  tag_ids: string[]
  title: string
}

export interface AdminWonderWorkDetail extends AdminWonderWorkItem {
  content_json: WonderlandDocument
  content_text: string
  cover_file_id: string
  demo_url: string | null
  source_url: string
  tags: string[]
  updated_at: string
}

export interface AdminWonderWorkItem {
  author_name: string
  created_at: string
  id: string
  kind: string
  like_count: number
  slug: string
  summary: string
  title: string
  view_count: number
  visibility: 'deleted' | 'hidden' | 'visible'
}

export async function findAdminWonderNews(id: string) {
  const result = await queryBusiness<AdminWonderNewsDetail>(`
    select article.id, article.slug, article.category_id, article.title,
           article.summary, article.content_json, article.cover_file_id,
           article.status, article.featured, article.pinned, article.sort,
           article.seo_title, article.seo_description, article.scheduled_at,
           article.published_at, article.created_at, article.updated_at,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    where article.id = $1::uuid
    limit 1
  `, [id])
  return result.rows[0] ?? null
}

export async function findAdminWonderQuestion(id: string) {
  const result = await queryBusiness<AdminWonderQuestionDetail>(`
    select question.id, question.slug, question.category_id, question.title,
           question.summary, question.content_json,
           coalesce(array_agg(link.tag_id order by link.position) filter (where link.tag_id is not null), '{}') as tag_ids
    from public.wonder_questions question
    left join public.wonder_question_tags link on link.question_id = question.id
    where question.id = $1::uuid
    group by question.id
    limit 1
  `, [id])
  return result.rows[0] ?? null
}

export async function findAdminWonderWork(id: string) {
  const result = await queryBusiness<AdminWonderWorkDetail>(`
    select work.id, work.slug, work.title, work.summary, work.kind,
           work.tags, work.source_url, work.demo_url, work.cover_file_id,
           work.content_json, work.content_text, work.visibility,
           work.like_count, work.view_count, work.created_at, work.updated_at,
           coalesce(nullif(author.display_name, ''), author.email) as author_name
    from public.wonder_works work
    join public.app_users author on author.id = work.author_id
    where work.id = $1::uuid
    limit 1
  `, [id])
  return result.rows[0] ?? null
}

export async function getAdminWonderCategories() {
  const result = await queryBusiness<WonderCategory & { reference_count: number }>(`
    select category.*,
           ((select count(*) from public.wonder_questions where category_id = category.id)
             + (select count(*) from public.wonder_news_articles where category_id = category.id))::integer as reference_count
    from public.wonder_categories category
    order by category.scope, category.depth, category.sort desc, category.name, category.id
  `)
  return result.rows
}

export async function getAdminWonderTags() {
  const result = await queryBusiness<{
    id: string
    is_active: boolean
    name: string
    slug: string
    usage_count: number
  }>(`
    select id, slug, name, is_active, usage_count
    from public.wonder_tags
    order by is_active desc, usage_count desc, sort desc, name, id
  `)
  return result.rows
}

export async function listAdminWonderComments(input: {
  limit: number
  offset: number
  q?: string
  targetType?: 'answer' | 'news' | 'question'
  visibility?: string
}) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`)
    conditions.push(`(
      comment.body ilike $${values.length}
      or question.title ilike $${values.length}
      or news.title ilike $${values.length}
      or coalesce(nullif(author.display_name, ''), author.email) ilike $${values.length}
    )`)
  }
  if (input.visibility) {
    values.push(input.visibility)
    conditions.push(`comment.visibility = $${values.length}`)
  }
  if (input.targetType === 'news')
    conditions.push('comment.news_id is not null')
  if (input.targetType === 'answer')
    conditions.push('comment.answer_id is not null')
  if (input.targetType === 'question')
    conditions.push('comment.question_id is not null and comment.answer_id is null')
  values.push(input.limit, input.offset)
  const result = await queryBusiness<{
    author_name: string
    body: string
    created_at: string
    id: string
    image_count: number
    target_slug: string
    target_title: string
    target_type: 'answer' | 'news' | 'question'
    total_count: string
    visibility: string
  }>(`
    select comment.id, comment.body, comment.visibility, comment.created_at,
           coalesce(nullif(author.display_name, ''), author.email) as author_name,
           case when comment.news_id is not null then 'news'
                when comment.answer_id is not null then 'answer' else 'question' end as target_type,
           coalesce(news.title, question.title) as target_title,
           coalesce(news.slug, question.slug) as target_slug,
           (select count(*) from public.wonder_comment_files link where link.comment_id = comment.id)::integer as image_count,
           count(*) over()::text as total_count
    from public.wonder_comments comment
    join public.app_users author on author.id = comment.author_id
    left join public.wonder_questions question on question.id = comment.question_id
    left join public.wonder_news_articles news on news.id = comment.news_id
    where ${conditions.join(' and ')}
    order by comment.created_at desc, comment.id desc
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

export async function listAdminWonderDiscussion(input: {
  limit: number
  offset: number
  q?: string
  type: 'answer' | 'comment'
  visibility?: string
}) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`)
    conditions.push(`${input.type === 'answer' ? 'answer.content_text' : 'comment.body'} ilike $${values.length}`)
  }
  if (input.visibility) {
    values.push(input.visibility)
    conditions.push(`${input.type}.visibility = $${values.length}`)
  }
  else {
    conditions.push(`${input.type}.visibility <> 'deleted'`)
  }
  conditions.push('question.visibility <> \'deleted\'')
  values.push(input.limit, input.offset)
  const contentExpression = input.type === 'answer' ? 'answer.content_text' : 'comment.body'
  const table = input.type === 'answer' ? 'wonder_answers answer' : 'wonder_comments comment'
  const questionJoin = input.type === 'answer' ? 'question.id = answer.question_id' : 'question.id = comment.question_id'
  const authorJoin = input.type === 'answer' ? 'author.id = answer.author_id' : 'author.id = comment.author_id'
  const result = await queryBusiness<{
    author_name: string
    content: string
    created_at: string
    id: string
    question_slug: string
    question_title: string
    total_count: string
    visibility: string
  }>(`
    select ${input.type}.id, left(${contentExpression}, 300) as content,
           ${input.type}.visibility, ${input.type}.created_at,
           question.title as question_title, question.slug as question_slug,
           coalesce(nullif(author.display_name, ''), author.email) as author_name,
           count(*) over()::text as total_count
    from public.${table}
    join public.wonder_questions question on ${questionJoin}
    join public.app_users author on ${authorJoin}
    where ${conditions.join(' and ')}
    order by ${input.type}.created_at desc, ${input.type}.id desc
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

export async function listAdminWonderNews(input: { limit: number, offset: number, q?: string, status?: WonderNewsStatus }) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`)
    conditions.push(`(article.title ilike $${values.length} or article.summary ilike $${values.length})`)
  }
  if (input.status) {
    values.push(input.status)
    conditions.push(`article.status = $${values.length}`)
  }
  values.push(input.limit, input.offset)
  const result = await queryBusiness<AdminWonderNewsItem & { total_count: string }>(`
    select article.id, article.slug, article.category_id, article.title,
           article.summary, article.cover_file_id, article.status,
           article.featured, article.pinned, article.sort,
           article.seo_title, article.seo_description, article.scheduled_at,
           article.published_at, article.created_at, article.updated_at,
           count(*) over()::text as total_count,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category
    from public.wonder_news_articles article
    join public.wonder_categories category on category.id = article.category_id
    where ${conditions.join(' and ')}
    order by article.pinned desc, article.updated_at desc, article.id desc
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

export async function listAdminWonderQuestions(input: { limit: number, offset: number, q?: string, visibility?: string }) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`)
    conditions.push(`(question.title ilike $${values.length} or question.summary ilike $${values.length})`)
  }
  if (input.visibility) {
    values.push(input.visibility)
    conditions.push(`question.visibility = $${values.length}`)
  }
  else {
    conditions.push('question.visibility <> \'deleted\'')
  }
  values.push(input.limit, input.offset)
  const result = await queryBusiness<{
    answer_count: number
    author_name: string
    category_name: string
    comment_count: number
    created_at: string
    id: string
    is_closed: boolean
    is_locked: boolean
    slug: string
    title: string
    total_count: string
    visibility: string
  }>(`
    select question.id, question.slug, question.title, question.visibility,
           question.is_closed, question.is_locked, question.answer_count,
           question.comment_count, question.created_at,
           coalesce(nullif(author.display_name, ''), author.email) as author_name,
           category.name as category_name, count(*) over()::text as total_count
    from public.wonder_questions question
    join public.app_users author on author.id = question.author_id
    join public.wonder_categories category on category.id = question.category_id
    where ${conditions.join(' and ')}
    order by question.created_at desc, question.id desc
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

export async function listAdminWonderReports(input: { limit: number, offset: number, status?: string }) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.status) {
    values.push(input.status)
    conditions.push(`report.status = $${values.length}`)
  }
  values.push(input.limit, input.offset)
  const result = await queryBusiness<{
    created_at: string
    details: string
    id: string
    reason: string
    reporter_name: string
    resolution: string | null
    status: string
    target_id: string
    target_summary: string
    target_type: 'answer' | 'comment' | 'question'
    total_count: string
  }>(`
    select report.id, report.reason, report.details, report.status,
           report.resolution, report.created_at,
           coalesce(nullif(reporter.display_name, ''), reporter.email) as reporter_name,
           case when report.question_id is not null then 'question'
                when report.answer_id is not null then 'answer' else 'comment' end as target_type,
           coalesce(report.question_id, report.answer_id, report.comment_id) as target_id,
           coalesce(question.title, left(answer.content_text, 140), left(comment.body, 140)) as target_summary,
           count(*) over()::text as total_count
    from public.wonder_reports report
    join public.app_users reporter on reporter.id = report.reporter_id
    left join public.wonder_questions question on question.id = report.question_id
    left join public.wonder_answers answer on answer.id = report.answer_id
    left join public.wonder_comments comment on comment.id = report.comment_id
    where ${conditions.join(' and ')}
    order by case report.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,
             report.created_at, report.id
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

export async function listAdminWonderWorks(input: { limit: number, offset: number, q?: string, visibility?: string }) {
  const values: unknown[] = []
  const conditions = ['true']
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`)
    conditions.push(`(work.title ilike $${values.length} escape '\\' or work.summary ilike $${values.length} escape '\\' or author.display_name ilike $${values.length} escape '\\')`)
  }
  if (input.visibility) {
    values.push(input.visibility)
    conditions.push(`work.visibility = $${values.length}`)
  }
  values.push(input.limit, input.offset)
  const result = await queryBusiness<AdminWonderWorkItem & { total_count: string }>(`
    select work.id, work.slug, work.title, work.summary, work.kind, work.visibility,
      work.like_count, work.view_count, work.created_at,
      coalesce(nullif(author.display_name, ''), author.email) as author_name,
      count(*) over()::text as total_count
    from public.wonder_works work
    join public.app_users author on author.id = work.author_id
    where ${conditions.join(' and ')}
    order by work.created_at desc, work.id desc
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return { list: result.rows, total: Number(result.rows[0]?.total_count ?? 0) }
}

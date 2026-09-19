import 'server-only'

import { queryBusiness } from '../../db/business'
import { listPublicWonderComments } from './comments'

import type {
  WonderAnswer,
  WonderCategory,
  WonderNewsListItem,
  WonderPortalData,
  WonderQuestionDetail,
  WonderQuestionListItem,
  WonderQuestionSort,
  WonderTag,
} from '../domain'

interface CountRow {
  answer_count: string
  member_count: string
  question_count: string
  resolved_count: string
}

const PUBLIC_AUTHOR_SQL = `jsonb_build_object(
  'id', author.id,
  'name', coalesce(nullif(author.display_name, ''), '社区用户'),
  'image', author.avatar_url
)`

export async function findPublicQuestionBySlug(slug: string): Promise<WonderQuestionDetail | null> {
  const question = await queryBusiness<WonderQuestionDetail>(`
    select question.id, question.slug, question.title, question.summary,
           question.content_json, question.content_text, question.is_closed,
           question.is_locked, question.accepted_answer_id, question.vote_score,
           question.hot_score::text, question.answer_count, question.comment_count,
           question.view_count, question.favorite_count, question.follower_count,
           question.last_activity_at, question.created_at,
           ${PUBLIC_AUTHOR_SQL} as author,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category,
           coalesce(tag_list.tags, '[]'::jsonb) as tags,
           '[]'::jsonb as answers,
           '[]'::jsonb as comments
    from public.wonder_questions question
    join public.app_users author on author.id = question.author_id
    join public.wonder_categories category on category.id = question.category_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('id', tag.id, 'name', tag.name, 'slug', tag.slug)
        order by link.position
      ) as tags
      from public.wonder_question_tags link
      join public.wonder_tags tag on tag.id = link.tag_id
      where link.question_id = question.id
    ) tag_list on true
    where lower(question.slug) = lower($1) and question.visibility = 'visible'
    limit 1
  `, [slug])
  const current = question.rows[0]
  if (!current)
    return null

  const [answers, nestedComments] = await Promise.all([
    queryBusiness<WonderAnswer>(`
      select answer.id, answer.question_id, answer.content_json, answer.vote_score,
             answer.comment_count, answer.edited_at, answer.created_at,
             (question.accepted_answer_id = answer.id) as is_accepted,
             '[]'::jsonb as comments,
             ${PUBLIC_AUTHOR_SQL} as author
      from public.wonder_answers answer
      join public.wonder_questions question on question.id = answer.question_id
      join public.app_users author on author.id = answer.author_id
      where answer.question_id = $1::uuid and answer.visibility = 'visible'
      order by (question.accepted_answer_id = answer.id) desc,
               answer.vote_score desc, answer.created_at, answer.id
      limit 30
    `, [current.id]),
    listPublicWonderComments({ questionId: current.id }),
  ])

  return {
    ...current,
    answers: answers.rows.map(answer => ({
      ...answer,
      comments: nestedComments.filter(comment => comment.answer_id === answer.id),
    })),
    comments: nestedComments.filter(comment => comment.answer_id === null),
  }
}

export async function getWonderlandPortal(options: { includeQuestions?: boolean, includeTags?: boolean } = {}): Promise<WonderPortalData> {
  const questionPagePromise: Promise<{ list: WonderQuestionListItem[], total: number }> = options.includeQuestions === false
    ? Promise.resolve({ list: [], total: 0 })
    : listPublicQuestionPage({ limit: 20 })
  const tagsPromise = options.includeTags === false
    ? Promise.resolve({ rows: [] as WonderTag[], rowCount: 0 })
    : queryBusiness<WonderTag>(`
        select id, slug, name, description, sort, is_active, usage_count
        from public.wonder_tags
        where is_active = true
        order by usage_count desc, sort desc, name, id
        limit 12
      `)
  const [categories, tags, questionPage, news, stats] = await Promise.all([
    queryBusiness<WonderCategory>(`
      select id, scope, parent_id, depth, slug, name, description, icon,
             sort, is_active, created_at, updated_at
      from public.wonder_categories
      where is_active = true
      order by scope, depth, sort desc, name, id
    `),
    tagsPromise,
    questionPagePromise,
    queryBusiness<WonderNewsListItem>(`
      select article.id, article.slug, article.title, article.summary,
             article.cover_file_id, article.featured, article.pinned,
             article.comment_count, article.published_at,
             jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category
      from public.wonder_news_articles article
      join public.wonder_categories category on category.id = article.category_id
      where article.status = 'published' and article.published_at <= now()
      order by article.published_at desc, article.id desc
      limit 5
    `),
    queryBusiness<CountRow>(`
      select
        (select count(*) from public.wonder_questions where visibility = 'visible')::text as question_count,
        (select count(*) from public.wonder_answers where visibility = 'visible')::text as answer_count,
        (select count(*) from public.wonder_questions
          where visibility = 'visible' and accepted_answer_id is not null)::text as resolved_count,
        (select count(distinct author_id) from (
          select author_id from public.wonder_questions where visibility = 'visible'
          union all
          select author_id from public.wonder_answers where visibility = 'visible'
        ) authors)::text as member_count
    `),
  ])

  const categoryRows = categories.rows
  const roots = categoryRows.filter(category => category.depth === 0)
  const currentStats = stats.rows[0]
  return {
    categories: roots.map(category => ({
      ...category,
      children: categoryRows.filter(child => child.parent_id === category.id),
    })),
    news: news.rows,
    questionTotal: questionPage.total,
    questions: questionPage.list,
    stats: {
      answerCount: Number(currentStats?.answer_count ?? 0),
      memberCount: Number(currentStats?.member_count ?? 0),
      questionCount: Number(currentStats?.question_count ?? 0),
      resolvedCount: Number(currentStats?.resolved_count ?? 0),
    },
    tags: tags.rows,
  }
}

export async function getWonderlandViewerState(questionId: string, userId: string) {
  const [question, answerVotes] = await Promise.all([
    queryBusiness<{
      favorite: boolean
      follow: boolean
      question_vote: number
    }>(`
      select
        exists(select 1 from public.wonder_question_favorites where question_id = $1::uuid and user_id = $2::uuid) as favorite,
        exists(select 1 from public.wonder_question_follows where question_id = $1::uuid and user_id = $2::uuid) as follow,
        coalesce((select value from public.wonder_question_votes where question_id = $1::uuid and user_id = $2::uuid), 0) as question_vote
    `, [questionId, userId]),
    queryBusiness<{ answer_id: string, value: number }>(`
      select vote.answer_id, vote.value
      from public.wonder_answer_votes vote
      join public.wonder_answers answer on answer.id = vote.answer_id
      where answer.question_id = $1::uuid and vote.user_id = $2::uuid
    `, [questionId, userId]),
  ])
  const state = question.rows[0]
  return {
    answerVotes: Object.fromEntries(answerVotes.rows.map(item => [item.answer_id, item.value])),
    favorite: state?.favorite ?? false,
    follow: state?.follow ?? false,
    questionVote: state?.question_vote ?? 0,
  }
}

export async function listPublicQuestionCategories() {
  const result = await queryBusiness<WonderCategory>(`
    select id, scope, parent_id, depth, slug, name, description, icon,
           sort, is_active, created_at, updated_at
    from public.wonder_categories
    where scope = 'question' and is_active = true
    order by depth, sort desc, name, id
  `)
  return result.rows
}

export async function listPublicQuestionPage(input: {
  categorySlug?: string
  limit: number
  page?: number
  q?: string
  sort?: WonderQuestionSort
  state?: 'closed' | 'open' | 'resolved'
  tagSlug?: string
}): Promise<{ list: WonderQuestionListItem[], page: number, pageSize: number, total: number, totalPages: number }> {
  const conditions = [`question.visibility = 'visible'`]
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }

  if (input.categorySlug) {
    add(parameter => `(
      category.slug = ${parameter}
      or category.parent_id = (select id from public.wonder_categories where slug = ${parameter} and scope = 'question')
    )`, input.categorySlug)
  }
  if (input.tagSlug) {
    add(parameter => `exists (
      select 1 from public.wonder_question_tags filter_link
      join public.wonder_tags filter_tag on filter_tag.id = filter_link.tag_id
      where filter_link.question_id = question.id and filter_tag.slug = ${parameter}
    )`, input.tagSlug)
  }
  if (input.q)
    add(parameter => `(question.title ilike ${parameter} or question.summary ilike ${parameter})`, `%${escapeLike(input.q)}%`)
  if (input.state === 'closed')
    conditions.push(`question.is_closed = true`)
  if (input.state === 'resolved')
    conditions.push(`question.is_closed = false and question.accepted_answer_id is not null`)
  if (input.state === 'open')
    conditions.push(`question.is_closed = false and question.accepted_answer_id is null`)

  const count = await queryBusiness<{ total: string }>(`
    select count(*)::text as total
    from public.wonder_questions question
    join public.wonder_categories category on category.id = question.category_id
    where ${conditions.join(' and ')}
  `, values)
  const total = Number(count.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / input.limit))
  const page = Math.min(totalPages, Math.max(1, input.page ?? 1))
  const orderBy = input.sort === 'active'
    ? 'question.last_activity_at desc, question.id desc'
    : input.sort === 'popular'
      ? 'question.hot_score desc, question.last_activity_at desc, question.id desc'
      : 'question.created_at desc, question.id desc'
  values.push(input.limit, (page - 1) * input.limit)
  const result = await queryBusiness<WonderQuestionListItem>(`
    select question.id, question.slug, question.title, question.summary,
           question.is_closed, question.is_locked, question.accepted_answer_id,
           question.vote_score, question.hot_score::text, question.answer_count,
           question.comment_count, question.view_count, question.favorite_count,
           question.follower_count, question.last_activity_at, question.created_at,
           ${PUBLIC_AUTHOR_SQL} as author,
           jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) as category,
           coalesce(tag_list.tags, '[]'::jsonb) as tags
    from public.wonder_questions question
    join public.app_users author on author.id = question.author_id
    join public.wonder_categories category on category.id = question.category_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('id', tag.id, 'name', tag.name, 'slug', tag.slug)
        order by link.position
      ) as tags
      from public.wonder_question_tags link
      join public.wonder_tags tag on tag.id = link.tag_id
      where link.question_id = question.id
    ) tag_list on true
    where ${conditions.join(' and ')}
    order by ${orderBy}
    limit $${values.length - 1} offset $${values.length}
  `, values)
  return {
    list: result.rows,
    page,
    pageSize: input.limit,
    total,
    totalPages,
  }
}

export async function listPublicQuestions(input: {
  categorySlug?: string
  limit: number
  q?: string
  state?: 'closed' | 'open' | 'resolved'
  tagSlug?: string
}): Promise<WonderQuestionListItem[]> {
  return (await listPublicQuestionPage(input)).list
}

export async function listWonderlandNotifications(userId: string, limit = 40) {
  const result = await queryBusiness<{
    actor_name: string | null
    answer_id: string | null
    comment_id: string | null
    created_at: string
    id: string
    news_slug: string | null
    news_title: string | null
    question_slug: string | null
    question_title: string | null
    read_at: string | null
    type: string
  }>(`
    select notification.id, notification.type, notification.answer_id,
           notification.comment_id, notification.read_at, notification.created_at,
           question.slug as question_slug, question.title as question_title,
           news.slug as news_slug, news.title as news_title,
           coalesce(nullif(actor.display_name, ''), '社区用户') as actor_name
    from public.wonder_notifications notification
    left join public.wonder_questions question on question.id = notification.question_id
    left join public.wonder_news_articles news on news.id = notification.news_id
    left join public.app_users actor on actor.id = notification.actor_id
    where notification.recipient_id = $1::uuid
      and (
        question.visibility = 'visible'
        or (news.status = 'published' and news.published_at <= now())
      )
    order by notification.created_at desc, notification.id desc
    limit $2
  `, [userId, limit])
  return result.rows
}

export async function listWonderlandSitemapRows() {
  const [questions, news] = await Promise.all([
    queryBusiness<{ slug: string, updated_at: string }>(`
      select slug, updated_at from public.wonder_questions
      where visibility = 'visible' order by updated_at desc limit 5000
    `),
    queryBusiness<{ slug: string, updated_at: string }>(`
      select slug, updated_at from public.wonder_news_articles
      where status = 'published' and published_at <= now()
      order by updated_at desc limit 5000
    `),
  ])
  return { news: news.rows, questions: questions.rows }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

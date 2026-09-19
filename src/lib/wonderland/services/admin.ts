import 'server-only'

import { ensureBusinessUser } from '../../db/business'
import { createSecurityHash } from '../../security'
import { WonderlandError } from '../errors'
import { discussionModerationTransition, questionModerationTransition } from '../moderation-state'
import { createWonderSlug } from '../validation'
import { workModerationTransition } from '../work-validation'
import { withWonderlandWriteTransaction } from '../write-transaction'

import type { WonderActor, WonderNewsStatus } from '../domain'
import type { sanitizeCategoryInput, sanitizeNewsInput, sanitizeQuestionInput } from '../validation'
import type { sanitizeWorkInput } from '../work-validation'

type CategoryInput = ReturnType<typeof sanitizeCategoryInput>
type NewsInput = ReturnType<typeof sanitizeNewsInput>
type QuestionInput = ReturnType<typeof sanitizeQuestionInput>
type WorkInput = ReturnType<typeof sanitizeWorkInput>

export async function deleteWonderCategory(actor: WonderActor, id: string) {
  return withAdminTransaction(actor, async (client) => {
    const result = await client.query(`delete from public.wonder_categories where id = $1::uuid returning id`, [id])
    if (!result.rows[0])
      throw new WonderlandError('分类不存在', 404, 'CATEGORY_NOT_FOUND')
    return result.rows[0]
  })
}

export async function deleteWonderNews(actor: WonderActor, id: string) {
  return withAdminTransaction(actor, async (client) => {
    const result = await client.query(`delete from public.wonder_news_articles where id = $1::uuid returning id`, [id])
    if (!result.rows[0])
      throw new WonderlandError('新闻不存在', 404, 'NEWS_NOT_FOUND')
    return result.rows[0]
  })
}

export async function moderateWonderDiscussion(input: {
  action: 'delete' | 'hide' | 'restore'
  actor: WonderActor
  id: string
  reason: string
  type: 'answer' | 'comment'
}) {
  return withAdminTransaction(input.actor, async (client) => {
    if (input.type === 'comment') {
      if (input.action === 'delete')
        throw new WonderlandError('评论删除请使用评论管理', 400, 'DISCUSSION_MODERATION_INVALID')
      const target = await client.query<{
        answer_id: string | null
        news_id: string | null
        question_id: string | null
        visibility: 'deleted' | 'hidden' | 'visible'
      }>(`
        select question_id, answer_id, news_id, visibility
        from public.wonder_comments
        where id = $1::uuid
        for update
      `, [input.id])
      const current = target.rows[0]
      if (!current)
        throw new WonderlandError('评论不存在', 404, 'DISCUSSION_NOT_FOUND')
      const transition = discussionModerationTransition(input.action, current.visibility)
      if (!transition.changed)
        return { id: input.id }
      if (current.news_id)
        await client.query('select id from public.wonder_news_articles where id = $1::uuid for update', [current.news_id])
      else
        await client.query('select id from public.wonder_questions where id = $1::uuid for update', [current.question_id])
      if (current.answer_id)
        await client.query('select id from public.wonder_answers where id = $1::uuid for update', [current.answer_id])
      await client.query(`
        update public.wonder_comments
        set visibility = $2,
            deleted_at = case when $2 = 'deleted' then coalesce(deleted_at, now()) else null end
        where id = $1::uuid
      `, [input.id, transition.nextVisibility])
      await client.query(`
        insert into public.wonder_moderation_events (
          actor_id, question_id, comment_id, action, reason
        ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5)
      `, [input.actor.id, current.question_id, input.id, input.action, input.reason])
      if (current.news_id)
        await recountNewsComments(client, current.news_id)
      else
        await recountDiscussion(client, current.question_id!)
      return { id: input.id }
    }

    const answer = await client.query<{
      question_id: string
      visibility: 'deleted' | 'hidden' | 'visible'
    }>(`
      select question_id, visibility
      from public.wonder_answers
      where id = $1::uuid
      for update
    `, [input.id])
    const current = answer.rows[0]
    if (!current)
      throw new WonderlandError('回答不存在', 404, 'DISCUSSION_NOT_FOUND')
    const transition = discussionModerationTransition(input.action, current.visibility)
    if (!transition.changed)
      return { id: input.id }
    await client.query(`
      update public.wonder_answers
      set visibility = $2,
          deleted_at = case when $2 = 'deleted' then coalesce(deleted_at, now()) else null end
      where id = $1::uuid
    `, [input.id, transition.nextVisibility])
    if (input.action === 'hide' || input.action === 'delete') {
      await client.query(`
        update public.wonder_questions
        set accepted_answer_id = null
        where id = $1::uuid and accepted_answer_id = $2::uuid
      `, [current.question_id, input.id])
    }
    await client.query(`
      insert into public.wonder_moderation_events (
        actor_id, question_id, answer_id, action, reason
      ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5)
    `, [input.actor.id, current.question_id, input.id, input.action, input.reason])
    await recountDiscussion(client, current.question_id)
    return { id: input.id }
  })
}

export async function moderateWonderQuestion(input: {
  action: 'close' | 'delete' | 'hide' | 'lock' | 'reopen' | 'restore' | 'unlock'
  actor: WonderActor
  id: string
  reason: string
}) {
  return withAdminTransaction(input.actor, async (client) => {
    const question = await client.query<{
      is_closed: boolean
      is_locked: boolean
      visibility: 'deleted' | 'hidden' | 'visible'
    }>(`
      select visibility, is_closed, is_locked
      from public.wonder_questions
      where id = $1::uuid
      for update
    `, [input.id])
    const current = question.rows[0]
    if (!current)
      throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
    const transition = questionModerationTransition(input.action, {
      isClosed: current.is_closed,
      isLocked: current.is_locked,
      visibility: current.visibility,
    })
    if (!transition.changed)
      return { id: input.id }
    await client.query(`
      update public.wonder_questions
      set visibility = $2,
          deleted_at = case when $2 = 'deleted' then coalesce(deleted_at, now()) else null end,
          is_closed = $3,
          closed_at = case when $3 then coalesce(closed_at, now()) else null end,
          is_locked = $4
      where id = $1::uuid
    `, [input.id, transition.nextVisibility, transition.nextIsClosed, transition.nextIsLocked])
    await client.query(`
      insert into public.wonder_moderation_events (actor_id, question_id, action, reason)
      values ($1::uuid, $2::uuid, $3, $4)
    `, [input.actor.id, input.id, input.action, input.reason])
    return { id: input.id }
  })
}

export async function moderateWonderWork(input: {
  action: 'delete' | 'hide' | 'restore'
  actor: WonderActor
  id: string
  reason: string
}) {
  return withAdminTransaction(input.actor, async (client) => {
    const current = await client.query<{ visibility: 'deleted' | 'hidden' | 'visible' }>(`
      select visibility from public.wonder_works where id = $1::uuid for update
    `, [input.id])
    if (!current.rows[0])
      throw new WonderlandError('作品不存在', 404, 'WORK_NOT_FOUND')
    if (input.action === 'hide' && current.rows[0].visibility === 'deleted')
      throw new WonderlandError('已删除作品请先恢复后再隐藏', 409, 'WORK_STATE_INVALID')
    const transition = workModerationTransition(input.action, current.rows[0].visibility)
    const work = await client.query<{ id: string }>(`
      update public.wonder_works
      set visibility = $2, deleted_at = case when $2 = 'deleted' then now() else null end,
          updated_at = now()
      where id = $1::uuid
      returning id
    `, [input.id, transition.nextVisibility])
    if (!work.rows[0])
      throw new WonderlandError('作品不存在', 404, 'WORK_NOT_FOUND')
    await client.query(`
      insert into public.wonder_work_moderation_events (actor_id, work_id, action, reason)
      values ($1::uuid, $2::uuid, $3, $4)
    `, [input.actor.id, input.id, input.action, input.reason])
    return { id: input.id, visibility: transition.nextVisibility }
  })
}

export async function publishScheduledWonderNews() {
  const { getBusinessPool } = await import('../../db/business')
  const client = await (await getBusinessPool()).connect()
  try {
    await client.query('begin')
    const due = await client.query<{ id: string }>(`
      select id from public.wonder_news_articles
      where status = 'scheduled' and scheduled_at <= now()
      order by scheduled_at, id
      for update skip locked
      limit 100
    `)
    const ids = due.rows.map(row => row.id)
    if (!ids.length) {
      await client.query('commit')
      return { published: 0 }
    }
    const result = await client.query(`
      update public.wonder_news_articles
      set status = 'published', published_at = scheduled_at
      where id = any($1::uuid[]) and status = 'scheduled'
    `, [ids])
    await client.query('commit')
    return { published: result.rowCount ?? 0 }
  }
  catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
  finally {
    client.release()
  }
}

export function readNewsStatus(value: string | null): WonderNewsStatus | undefined {
  return value === 'draft' || value === 'scheduled' || value === 'published' || value === 'archived' ? value : undefined
}

export async function resolveWonderReport(input: {
  actor: WonderActor
  id: string
  resolution: string
  status: 'dismissed' | 'resolved'
}) {
  return withAdminTransaction(input.actor, async (client) => {
    const report = await client.query<{
      answer_id: string | null
      comment_id: string | null
      question_id: string | null
    }>(`
      update public.wonder_reports
      set status = $2, assignee_id = $3::uuid, resolution = $4, resolved_at = now()
      where id = $1::uuid and status in ('pending', 'reviewing')
      returning question_id, answer_id, comment_id
    `, [input.id, input.status, input.actor.id, input.resolution])
    const current = report.rows[0]
    if (!current)
      throw new WonderlandError('举报不存在或已处理', 409, 'REPORT_STATE_CHANGED')
    await client.query(`
      insert into public.wonder_moderation_events (
        actor_id, question_id, answer_id, comment_id, action, reason
      ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6)
    `, [input.actor.id, current.question_id, current.answer_id, current.comment_id, input.status === 'resolved' ? 'resolve-report' : 'dismiss-report', input.resolution])
    return { id: input.id, status: input.status }
  })
}

export async function saveWonderCategory(input: { actor: WonderActor, category: CategoryInput, id?: string }) {
  return withAdminTransaction(input.actor, async (client) => {
    const depth = input.category.parentId ? 1 : 0
    if (input.id) {
      const result = await client.query(`
        update public.wonder_categories set
          scope = $2, parent_id = $3::uuid, depth = $4, slug = $5,
          name = $6, description = $7, icon = $8, sort = $9, is_active = $10
        where id = $1::uuid returning *
      `, [input.id, input.category.scope, input.category.parentId, depth, input.category.slug, input.category.name, input.category.description, input.category.icon, input.category.sort, input.category.isActive])
      if (!result.rows[0])
        throw new WonderlandError('分类不存在', 404, 'CATEGORY_NOT_FOUND')
      return result.rows[0]
    }
    const result = await client.query(`
      insert into public.wonder_categories (
        scope, parent_id, depth, slug, name, description, icon, sort, is_active, created_by
      ) values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
      returning *
    `, [input.category.scope, input.category.parentId, depth, input.category.slug, input.category.name, input.category.description, input.category.icon, input.category.sort, input.category.isActive, input.actor.id])
    return result.rows[0]
  })
}

export async function saveWonderNews(input: { actor: WonderActor, expectedUpdatedAt?: string, id?: string, news: NewsInput }) {
  return withAdminTransaction(input.actor, async (client) => {
    const category = await client.query(`select id from public.wonder_categories where id = $1::uuid and scope = 'news'`, [input.news.categoryId])
    if (!category.rowCount)
      throw new WonderlandError('新闻分类不存在', 409, 'NEWS_CATEGORY_NOT_FOUND')
    if (input.news.coverFileId)
      await validateAdminFile(client, input.news.coverFileId)
    await validateAdminFiles(client, input.news.content.fileIds)

    const publishedAt = input.news.status === 'published' ? new Date() : null
    if (input.id) {
      const current = await client.query<{ author_id: string, published_at: Date | null, updated_at: Date }>(`select author_id, published_at, updated_at from public.wonder_news_articles where id = $1::uuid for update`, [input.id])
      if (!current.rows[0])
        throw new WonderlandError('新闻不存在', 404, 'NEWS_NOT_FOUND')
      if (input.expectedUpdatedAt) {
        const expected = new Date(input.expectedUpdatedAt)
        if (Number.isNaN(expected.getTime()) || expected.getTime() !== current.rows[0].updated_at.getTime())
          throw new WonderlandError('这篇文章已在其他页面被修改，请刷新后再编辑', 409, 'NEWS_EDIT_CONFLICT')
      }
      const result = await client.query<{ id: string, slug: string, updated_at: Date }>(`
        update public.wonder_news_articles set
          category_id = $2::uuid, title = $3, summary = $4,
          content_json = $5::jsonb, content_text = $6, cover_file_id = $7::uuid,
          status = $8, featured = $9, pinned = $10, sort = $11,
          seo_title = $12, seo_description = $13, scheduled_at = $14,
          published_at = case when $8 = 'published' then coalesce(published_at, $15) else published_at end,
          archived_at = case when $8 = 'archived' then now() else null end
        where id = $1::uuid returning id, slug, updated_at
      `, [input.id, input.news.categoryId, input.news.title, input.news.summary, JSON.stringify(input.news.content.document), input.news.content.text, input.news.coverFileId, input.news.status, input.news.featured, input.news.pinned, input.news.sort, input.news.seoTitle, input.news.seoDescription, input.news.scheduledAt, publishedAt])
      await replaceNewsFiles(client, input.id, input.news.content.fileIds)
      return result.rows[0]
    }

    const result = await client.query<{ id: string, slug: string, updated_at: Date }>(`
      insert into public.wonder_news_articles (
        slug, category_id, author_id, title, summary, content_json, content_text,
        cover_file_id, status, featured, pinned, sort, seo_title,
        seo_description, scheduled_at, published_at
      ) values (
        $1, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7,
        $8::uuid, $9, $10, $11, $12, $13, $14, $15, $16
      ) returning id, slug, updated_at
    `, [createWonderSlug(input.news.title, 'news'), input.news.categoryId, input.actor.id, input.news.title, input.news.summary, JSON.stringify(input.news.content.document), input.news.content.text, input.news.coverFileId, input.news.status, input.news.featured, input.news.pinned, input.news.sort, input.news.seoTitle, input.news.seoDescription, input.news.scheduledAt, publishedAt])
    await replaceNewsFiles(client, result.rows[0]!.id, input.news.content.fileIds)
    return result.rows[0]
  })
}

export async function saveWonderQuestion(input: { actor: WonderActor, id?: string, question: QuestionInput }) {
  return withAdminTransaction(input.actor, async (client) => {
    await validateAdminQuestionTaxonomy(client, input.question.categoryId, input.question.tagIds)
    await validateAdminFiles(client, input.question.content.fileIds)
    if (input.id) {
      const result = await client.query<{ id: string, slug: string }>(`
        update public.wonder_questions set
          category_id = $2::uuid, title = $3, summary = $4,
          content_json = $5::jsonb, content_text = $6, edited_at = now()
        where id = $1::uuid and visibility <> 'deleted'
        returning id, slug
      `, [input.id, input.question.categoryId, input.question.title, input.question.summary, JSON.stringify(input.question.content.document), input.question.content.text])
      if (!result.rows[0])
        throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
      await replaceQuestionFiles(client, input.id, input.question.content.fileIds)
      await replaceQuestionTags(client, input.id, input.question.tagIds)
      return result.rows[0]
    }

    const result = await client.query<{ id: string, slug: string }>(`
      insert into public.wonder_questions (
        slug, author_id, category_id, title, summary, content_json, content_text
      ) values ($1, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7)
      returning id, slug
    `, [createWonderSlug(input.question.title), input.actor.id, input.question.categoryId, input.question.title, input.question.summary, JSON.stringify(input.question.content.document), input.question.content.text])
    await client.query(`
      insert into public.wonder_question_follows (question_id, user_id)
      values ($1::uuid, $2::uuid)
    `, [result.rows[0]!.id, input.actor.id])
    await client.query(`update public.wonder_questions set follower_count = 1 where id = $1::uuid`, [result.rows[0]!.id])
    await replaceQuestionFiles(client, result.rows[0]!.id, input.question.content.fileIds)
    await replaceQuestionTags(client, result.rows[0]!.id, input.question.tagIds)
    return result.rows[0]
  })
}

export async function saveWonderWork(input: {
  actor: WonderActor
  expectedUpdatedAt?: string
  id: string
  work: WorkInput
}) {
  return withAdminTransaction(input.actor, async (client) => {
    await validateAdminFile(client, input.work.coverFileId)
    await validateAdminFiles(client, input.work.content.fileIds)

    const current = await client.query<{ updated_at: Date, visibility: 'deleted' | 'hidden' | 'visible' }>(`
      select updated_at, visibility
      from public.wonder_works
      where id = $1::uuid
      for update
    `, [input.id])
    const row = current.rows[0]
    if (!row || row.visibility === 'deleted')
      throw new WonderlandError('作品不存在或已删除', 404, 'WORK_NOT_FOUND')
    if (input.expectedUpdatedAt) {
      const expected = new Date(input.expectedUpdatedAt)
      if (Number.isNaN(expected.getTime()) || expected.getTime() !== row.updated_at.getTime())
        throw new WonderlandError('这件作品已在其他页面被修改，请刷新后再编辑', 409, 'WORK_EDIT_CONFLICT')
    }

    const result = await client.query<{ id: string, slug: string, updated_at: Date }>(`
      update public.wonder_works set
        title = $2, summary = $3, kind = $4, tags = $5::text[],
        source_url = $6, demo_url = $7,
        content_json = $8::jsonb, content_text = $9,
        cover_file_id = $10::uuid, updated_at = now()
      where id = $1::uuid and visibility <> 'deleted'
      returning id, slug, updated_at
    `, [
      input.id,
      input.work.title,
      input.work.summary,
      input.work.kind,
      input.work.tags,
      input.work.sourceUrl,
      input.work.demoUrl,
      JSON.stringify(input.work.content.document),
      input.work.content.text,
      input.work.coverFileId,
    ])
    if (!result.rows[0])
      throw new WonderlandError('作品不存在或已删除', 404, 'WORK_NOT_FOUND')
    await replaceWorkFiles(client, input.id, input.work.content.fileIds)
    return result.rows[0]
  })
}

async function recountDiscussion(client: import('pg').PoolClient, questionId: string) {
  await client.query(`
    update public.wonder_questions question
    set answer_count = (select count(*) from public.wonder_answers where question_id = question.id and visibility = 'visible'),
        comment_count = (select count(*) from public.wonder_comments where question_id = question.id and answer_id is null and visibility = 'visible')
    where question.id = $1::uuid
  `, [questionId])
  await client.query(`
    update public.wonder_answers answer
    set comment_count = (select count(*) from public.wonder_comments where answer_id = answer.id and visibility = 'visible')
    where answer.question_id = $1::uuid
  `, [questionId])
}

async function recountNewsComments(client: import('pg').PoolClient, newsId: string) {
  await client.query(`
    update public.wonder_news_articles article
    set comment_count = (
      select count(*) from public.wonder_comments
      where news_id = article.id and visibility = 'visible'
    )
    where article.id = $1::uuid
  `, [newsId])
}

async function replaceNewsFiles(client: import('pg').PoolClient, articleId: string, fileIds: string[]) {
  await client.query(`delete from public.wonder_news_files where article_id = $1::uuid`, [articleId])
  for (const [position, fileId] of fileIds.entries()) {
    await client.query(`insert into public.wonder_news_files (article_id, file_id, position) values ($1::uuid, $2::uuid, $3)`, [articleId, fileId, position])
  }
}

async function replaceQuestionFiles(client: import('pg').PoolClient, questionId: string, fileIds: string[]) {
  await client.query(`delete from public.wonder_question_files where question_id = $1::uuid`, [questionId])
  for (const [position, fileId] of fileIds.entries())
    await client.query(`insert into public.wonder_question_files (question_id, file_id, position) values ($1::uuid, $2::uuid, $3)`, [questionId, fileId, position])
}

async function replaceQuestionTags(client: import('pg').PoolClient, questionId: string, tagIds: string[]) {
  const previous = await client.query<{ tag_id: string }>(`delete from public.wonder_question_tags where question_id = $1::uuid returning tag_id`, [questionId])
  if (previous.rows.length) {
    await client.query(`
      update public.wonder_tags tag set usage_count = greatest(0, usage_count - previous.count)
      from (
        select removed.tag_id, count(*)::integer as count
        from unnest($1::uuid[]) as removed(tag_id)
        group by removed.tag_id
      ) previous
      where tag.id = previous.tag_id
    `, [previous.rows.map(row => row.tag_id)])
  }
  for (const [position, tagId] of tagIds.entries())
    await client.query(`insert into public.wonder_question_tags (question_id, tag_id, position) values ($1::uuid, $2::uuid, $3)`, [questionId, tagId, position])
  if (tagIds.length)
    await client.query(`update public.wonder_tags set usage_count = usage_count + 1 where id = any($1::uuid[])`, [tagIds])
}

async function replaceWorkFiles(client: import('pg').PoolClient, workId: string, fileIds: string[]) {
  await client.query(`delete from public.wonder_work_files where work_id = $1::uuid`, [workId])
  for (const [position, fileId] of fileIds.entries())
    await client.query(`insert into public.wonder_work_files (work_id, file_id, position) values ($1::uuid, $2::uuid, $3)`, [workId, fileId, position])
}

async function validateAdminFile(client: import('pg').PoolClient, fileId: string) {
  const result = await client.query(`select id from public.file_objects where id = $1::uuid and status = 'ready' and mime_type like 'image/%' for key share`, [fileId])
  if (!result.rowCount)
    throw new WonderlandError('图片不存在或尚未准备完成', 409, 'FILE_NOT_READY')
}

async function validateAdminFiles(client: import('pg').PoolClient, fileIds: string[]) {
  for (const fileId of fileIds)
    await validateAdminFile(client, fileId)
}

async function validateAdminQuestionTaxonomy(client: import('pg').PoolClient, categoryId: string, tagIds: string[]) {
  const category = await client.query(`select id from public.wonder_categories where id = $1::uuid and scope = 'question'`, [categoryId])
  if (!category.rowCount)
    throw new WonderlandError('问题分类不存在', 409, 'QUESTION_CATEGORY_NOT_FOUND')
  if (tagIds.length) {
    const tags = await client.query(`select id from public.wonder_tags where id = any($1::uuid[]) and is_active = true`, [tagIds])
    if (tags.rowCount !== tagIds.length)
      throw new WonderlandError('问题标签不存在或已停用', 409, 'QUESTION_TAG_NOT_FOUND')
  }
}

function withAdminTransaction<T>(actor: WonderActor, callback: (client: import('pg').PoolClient) => Promise<T>) {
  return withWonderlandWriteTransaction({
    action: 'admin-mutate',
    identityHash: createSecurityHash('wonderland-admin', actor.id),
    limit: 1000,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(actor, client)
    return callback(client)
  })
}

import 'server-only'

import { createHash } from 'node:crypto'

import { requireAccountCapability } from '../../auth/capabilities'
import { ensureBusinessUser } from '../../db/business'
import { getControlPool } from '../../db/control'
import { createSecurityHash } from '../../security'
import { WonderlandError } from '../errors'
import { createWonderSlug } from '../validation'
import { withWonderlandWriteTransaction } from '../write-transaction'

import type { WonderlandDocument } from '../content'
import type { WonderActor, WonderReportReason } from '../domain'
import type { PoolClient } from 'pg'

interface NormalizedContent {
  document: WonderlandDocument
  fileIds: string[]
  text: string
}

export async function acceptAnswer(input: {
  actor: WonderActor
  answerId: string
  questionId: string
  selected: boolean
}) {
  return withWonderlandWriteTransaction({
    action: 'answer-accept',
    identityHash: userIdentity(input.actor.id),
    limit: 60,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const question = await client.query<{
      accepted_answer_id: string | null
      author_id: string
      is_locked: boolean
    }>(`
      select author_id, accepted_answer_id, is_locked
      from public.wonder_questions
      where id = $1::uuid and visibility = 'visible'
      for update
    `, [input.questionId])
    const current = question.rows[0]
    if (!current)
      throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
    if (current.author_id !== input.actor.id)
      throw new WonderlandError('只有提问者可以采纳回答', 403, 'ANSWER_ACCEPT_FORBIDDEN')
    if (current.is_locked)
      throw new WonderlandError('问题已锁定', 409, 'QUESTION_LOCKED')
    const answer = await client.query<{ author_id: string }>(`
      select author_id from public.wonder_answers
      where id = $1::uuid and question_id = $2::uuid and visibility = 'visible'
    `, [input.answerId, input.questionId])
    const currentAnswer = answer.rows[0]
    if (!currentAnswer)
      throw new WonderlandError('回答不存在', 404, 'ANSWER_NOT_FOUND')

    const nextAnswerId = input.selected ? input.answerId : null
    if (!input.selected && current.accepted_answer_id !== input.answerId)
      throw new WonderlandError('该回答未被采纳', 409, 'ANSWER_NOT_ACCEPTED')
    await client.query(`
      update public.wonder_questions
      set accepted_answer_id = $2::uuid, hot_score = hot_score + 2
      where id = $1::uuid
    `, [input.questionId, nextAnswerId])
    await client.query(`
      insert into public.wonder_moderation_events (
        actor_id, question_id, answer_id, action, reason
      ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5)
    `, [input.actor.id, input.questionId, input.answerId, input.selected ? 'accept' : 'unaccept', input.selected ? '提问者采纳回答' : '提问者取消采纳'])
    if (currentAnswer.author_id !== input.actor.id) {
      await createNotification(client, {
        actorId: input.actor.id,
        answerId: input.answerId,
        dedupeKey: `answer:${input.answerId}:${input.selected ? 'accepted' : 'unaccepted'}:${Date.now()}`,
        questionId: input.questionId,
        recipientId: currentAnswer.author_id,
        type: input.selected ? 'answer-accepted' : 'answer-unaccepted',
      })
    }
    return { acceptedAnswerId: nextAnswerId }
  })
}

export async function createAnswer(input: {
  actor: WonderActor
  content: NormalizedContent
  idempotencyKey: string
  questionId: string
}) {
  await requireAccountCapability(input.actor.id, 'answer')
  const requestHash = hashRequest({ content: input.content.document, questionId: input.questionId })
  return withWonderlandWriteTransaction({
    action: 'answer-create',
    identityHash: userIdentity(input.actor.id),
    limit: 60,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const previous = await reserveIdempotencyKey(client, {
      action: 'answer.create',
      actorId: input.actor.id,
      key: input.idempotencyKey,
      requestHash,
    })
    if (previous)
      return readCreatedAnswer(client, previous)

    const question = await client.query<{ author_id: string, is_closed: boolean, is_locked: boolean }>(`
      select author_id, is_closed, is_locked
      from public.wonder_questions
      where id = $1::uuid and visibility = 'visible'
      for update
    `, [input.questionId])
    const current = question.rows[0]
    if (!current)
      throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
    if (current.is_closed)
      throw new WonderlandError('问题已经关闭', 409, 'QUESTION_CLOSED')
    if (current.is_locked)
      throw new WonderlandError('问题已锁定', 409, 'QUESTION_LOCKED')

    await lockAndValidateFiles(client, input.content.fileIds, input.actor.id)
    const answer = await client.query<{ id: string }>(`
      insert into public.wonder_answers (
        question_id, author_id, content_version, content_json, content_text
      ) values ($1::uuid, $2::uuid, 1, $3::jsonb, $4)
      returning id
    `, [input.questionId, input.actor.id, JSON.stringify(input.content.document), input.content.text])
    const answerId = answer.rows[0]!.id
    await insertOrderedLinks(client, 'wonder_answer_files', 'answer_id', 'file_id', answerId, input.content.fileIds)
    await client.query(`
      update public.wonder_questions
      set answer_count = answer_count + 1,
          last_activity_at = now(),
          hot_score = hot_score + 3
      where id = $1::uuid
    `, [input.questionId])
    if (current.author_id !== input.actor.id) {
      await createNotification(client, {
        actorId: input.actor.id,
        answerId,
        dedupeKey: `answer:${answerId}:created`,
        questionId: input.questionId,
        recipientId: current.author_id,
        type: 'new-answer',
      })
    }
    await completeIdempotencyKey(client, input.actor.id, 'answer.create', input.idempotencyKey, 'answer', answerId)
    return { id: answerId }
  })
}

export async function createComment(input: {
  actor: WonderActor
  answerId?: string
  body: string
  fileIds: string[]
  newsId?: string
  parentId: string | null
  questionId?: string
}) {
  await requireAccountCapability(input.actor.id, 'comment')
  return withWonderlandWriteTransaction({
    action: 'comment-create',
    identityHash: userIdentity(input.actor.id),
    limit: 120,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const isNewsComment = Boolean(input.newsId)
    if (isNewsComment === Boolean(input.questionId) || (input.answerId && !input.questionId))
      throw new WonderlandError('评论目标无效', 400, 'COMMENT_TARGET_INVALID')

    let recipientId: string | null = null
    if (input.newsId) {
      const news = await client.query<{ author_id: string }>(`
        select author_id from public.wonder_news_articles
        where id = $1::uuid and status = 'published' and published_at <= now()
        for update
      `, [input.newsId])
      if (!news.rows[0])
        throw new WonderlandError('新闻不存在或尚未发布', 404, 'NEWS_NOT_FOUND')
      recipientId = news.rows[0].author_id
    }
    else {
      const questionId = input.questionId!
      const question = await client.query<{ author_id: string, is_closed: boolean, is_locked: boolean }>(`
        select author_id, is_closed, is_locked from public.wonder_questions
        where id = $1::uuid and visibility = 'visible' for update
      `, [questionId])
      const currentQuestion = question.rows[0]
      if (!currentQuestion)
        throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
      if (currentQuestion.is_closed || currentQuestion.is_locked)
        throw new WonderlandError('当前问题不能继续评论', 409, currentQuestion.is_locked ? 'QUESTION_LOCKED' : 'QUESTION_CLOSED')
      recipientId = currentQuestion.author_id

      if (input.answerId) {
        const answer = await client.query<{ author_id: string }>(`
          select author_id from public.wonder_answers
          where id = $1::uuid and question_id = $2::uuid and visibility = 'visible'
        `, [input.answerId, questionId])
        if (!answer.rows[0])
          throw new WonderlandError('回答不存在', 404, 'ANSWER_NOT_FOUND')
        recipientId = answer.rows[0].author_id
      }
    }
    if (input.parentId) {
      const parent = await client.query<{ author_id: string }>(`
        select author_id from public.wonder_comments
        where id = $1::uuid
          and question_id is not distinct from $2::uuid
          and answer_id is not distinct from $3::uuid
          and news_id is not distinct from $4::uuid and parent_id is null
          and visibility = 'visible'
      `, [input.parentId, input.questionId ?? null, input.answerId ?? null, input.newsId ?? null])
      if (!parent.rows[0])
        throw new WonderlandError('回复的评论不存在', 404, 'COMMENT_PARENT_NOT_FOUND')
      recipientId = parent.rows[0].author_id
    }

    await lockAndValidateFiles(client, input.fileIds, input.actor.id)
    const comment = await client.query<{ id: string }>(`
      insert into public.wonder_comments (
        question_id, answer_id, news_id, parent_id, author_id, body
      ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6)
      returning id
    `, [input.questionId ?? null, input.answerId ?? null, input.newsId ?? null, input.parentId, input.actor.id, input.body])
    const commentId = comment.rows[0]!.id
    await insertOrderedLinks(client, 'wonder_comment_files', 'comment_id', 'file_id', commentId, input.fileIds)
    if (input.newsId) {
      await client.query(`
        update public.wonder_news_articles set comment_count = comment_count + 1 where id = $1::uuid
      `, [input.newsId])
    }
    else if (input.answerId) {
      await client.query(`
        update public.wonder_answers set comment_count = comment_count + 1 where id = $1::uuid
      `, [input.answerId])
    }
    else {
      await client.query(`
        update public.wonder_questions set comment_count = comment_count + 1 where id = $1::uuid
      `, [input.questionId!])
    }
    if (input.questionId) {
      await client.query(`
        update public.wonder_questions
        set last_activity_at = now(), hot_score = hot_score + 0.5
        where id = $1::uuid
      `, [input.questionId])
    }
    if (recipientId && recipientId !== input.actor.id) {
      await createNotification(client, {
        actorId: input.actor.id,
        answerId: input.answerId ?? null,
        commentId,
        dedupeKey: `comment:${commentId}:created`,
        newsId: input.newsId ?? null,
        questionId: input.questionId ?? null,
        recipientId,
        type: 'new-comment',
      })
    }
    return { id: commentId }
  })
}

export async function createQuestion(input: {
  actor: WonderActor
  categoryId: string
  content: NormalizedContent
  idempotencyKey: string
  summary: string
  tagIds: string[]
  title: string
}) {
  await requireAccountCapability(input.actor.id, 'ask')
  const requestHash = hashRequest({
    categoryId: input.categoryId,
    content: input.content.document,
    summary: input.summary,
    tagIds: input.tagIds,
    title: input.title,
  })

  return withWonderlandWriteTransaction({
    action: 'question-create',
    identityHash: userIdentity(input.actor.id),
    limit: 10,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const previous = await reserveIdempotencyKey(client, {
      action: 'question.create',
      actorId: input.actor.id,
      key: input.idempotencyKey,
      requestHash,
    })
    if (previous)
      return readCreatedQuestion(client, previous)

    await validateQuestionTaxonomy(client, input.categoryId, input.tagIds)
    await lockAndValidateFiles(client, input.content.fileIds, input.actor.id)

    const question = await client.query<{ id: string, slug: string }>(`
      insert into public.wonder_questions (
        slug, author_id, category_id, title, summary,
        content_version, content_json, content_text
      ) values ($1, $2::uuid, $3::uuid, $4, $5, 1, $6::jsonb, $7)
      returning id, slug
    `, [
      createWonderSlug(input.title),
      input.actor.id,
      input.categoryId,
      input.title,
      input.summary,
      JSON.stringify(input.content.document),
      input.content.text,
    ])
    const created = question.rows[0]!

    await insertOrderedLinks(client, 'wonder_question_tags', 'question_id', 'tag_id', created.id, input.tagIds)
    await insertOrderedLinks(client, 'wonder_question_files', 'question_id', 'file_id', created.id, input.content.fileIds)
    if (input.tagIds.length) {
      await client.query(`
        update public.wonder_tags
        set usage_count = usage_count + 1
        where id = any($1::uuid[])
      `, [input.tagIds])
    }
    await client.query(`
      insert into public.wonder_question_follows (question_id, user_id)
      values ($1::uuid, $2::uuid)
    `, [created.id, input.actor.id])
    await client.query(`
      update public.wonder_questions set follower_count = 1 where id = $1::uuid
    `, [created.id])
    await completeIdempotencyKey(client, input.actor.id, 'question.create', input.idempotencyKey, 'question', created.id)
    return created
  })
}

export async function createReport(input: {
  actor: WonderActor
  details: string
  reason: WonderReportReason
  targetId: string
  targetType: 'answer' | 'comment' | 'question'
}) {
  return withWonderlandWriteTransaction({
    action: 'report-create',
    identityHash: userIdentity(input.actor.id),
    limit: 20,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    await assertVisibleReportTarget(client, input.targetType, input.targetId)
    try {
      const result = await client.query<{ id: string }>(`
        insert into public.wonder_reports (
          reporter_id, question_id, answer_id, comment_id, reason, details
        ) values (
          $1::uuid,
          case when $2 = 'question' then $3::uuid end,
          case when $2 = 'answer' then $3::uuid end,
          case when $2 = 'comment' then $3::uuid end,
          $4, $5
        ) returning id
      `, [input.actor.id, input.targetType, input.targetId, input.reason, input.details])
      return result.rows[0]!
    }
    catch (error) {
      if (databaseCode(error) === '23505')
        throw new WonderlandError('你已经举报过该内容', 409, 'DUPLICATE_REPORT')
      throw error
    }
  })
}

export async function markNotificationsRead(actor: WonderActor, ids: string[]) {
  if (!ids.length)
    return { updated: 0 }
  return withWonderlandWriteTransaction({
    action: 'question-engage',
    identityHash: userIdentity(actor.id),
    limit: 300,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(actor, client)
    const result = await client.query(`
      update public.wonder_notifications set read_at = coalesce(read_at, now())
      where recipient_id = $1::uuid and id = any($2::uuid[])
    `, [actor.id, ids])
    return { updated: result.rowCount ?? 0 }
  })
}

export async function recordQuestionView(input: {
  identityHash: string
  questionId: string
}) {
  return withWonderlandWriteTransaction({
    action: 'question-view',
    identityHash: input.identityHash,
    limit: 500,
    windowSeconds: 3600,
  }, async (client) => {
    const bucketStart = new Date(Math.floor(Date.now() / 3600000) * 3600000)
    const inserted = await client.query(`
      insert into public.wonder_question_view_events (question_id, viewer_hash, bucket_start)
      select id, $2, $3 from public.wonder_questions
      where id = $1::uuid and visibility = 'visible'
      on conflict do nothing
      returning id
    `, [input.questionId, input.identityHash, bucketStart])
    if (inserted.rowCount) {
      await client.query(`
        update public.wonder_questions set view_count = view_count + 1 where id = $1::uuid
      `, [input.questionId])
    }
    return { counted: Boolean(inserted.rowCount) }
  })
}

export async function setAnswerVote(input: {
  actor: WonderActor
  answerId: string
  value: -1 | 0 | 1
}) {
  return withWonderlandWriteTransaction({
    action: 'answer-vote',
    identityHash: userIdentity(input.actor.id),
    limit: 300,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const answer = await client.query<{ author_id: string, question_id: string, vote_score: number }>(`
      select author_id, question_id, vote_score from public.wonder_answers
      where id = $1::uuid and visibility = 'visible' for update
    `, [input.answerId])
    const currentAnswer = answer.rows[0]
    if (!currentAnswer)
      throw new WonderlandError('回答不存在', 404, 'ANSWER_NOT_FOUND')
    if (currentAnswer.author_id === input.actor.id)
      throw new WonderlandError('不能给自己的回答投票', 409, 'SELF_VOTE_FORBIDDEN')
    const existing = await client.query<{ value: number }>(`
      select value from public.wonder_answer_votes
      where answer_id = $1::uuid and user_id = $2::uuid for update
    `, [input.answerId, input.actor.id])
    const previous = existing.rows[0]?.value ?? 0
    if (input.value === 0) {
      await client.query(`delete from public.wonder_answer_votes where answer_id = $1::uuid and user_id = $2::uuid`, [input.answerId, input.actor.id])
    }
    else {
      await client.query(`
        insert into public.wonder_answer_votes (answer_id, user_id, value)
        values ($1::uuid, $2::uuid, $3)
        on conflict (answer_id, user_id) do update set value = excluded.value
      `, [input.answerId, input.actor.id, input.value])
    }
    const delta = input.value - previous
    const updated = await client.query<{ vote_score: number }>(`
      update public.wonder_answers set vote_score = vote_score + $2 where id = $1::uuid returning vote_score
    `, [input.answerId, delta])
    await client.query(`update public.wonder_questions set hot_score = hot_score + $2 where id = $1::uuid`, [currentAnswer.question_id, Math.abs(delta) * 0.5])
    return { value: input.value, voteScore: updated.rows[0]!.vote_score }
  })
}

export async function setQuestionEngagement(input: {
  actor: WonderActor
  questionId: string
  selected: boolean
  type: 'favorite' | 'follow'
}) {
  return withWonderlandWriteTransaction({
    action: 'question-engage',
    identityHash: userIdentity(input.actor.id),
    limit: 300,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const question = await client.query(`select id from public.wonder_questions where id = $1::uuid and visibility = 'visible' for update`, [input.questionId])
    if (!question.rowCount)
      throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
    const table = input.type === 'favorite' ? 'wonder_question_favorites' : 'wonder_question_follows'
    const countColumn = input.type === 'favorite' ? 'favorite_count' : 'follower_count'
    const changed = input.selected
      ? await client.query(`insert into public.${table} (question_id, user_id) values ($1::uuid, $2::uuid) on conflict do nothing returning question_id`, [input.questionId, input.actor.id])
      : await client.query(`delete from public.${table} where question_id = $1::uuid and user_id = $2::uuid returning question_id`, [input.questionId, input.actor.id])
    const delta = changed.rowCount ? (input.selected ? 1 : -1) : 0
    const updated = await client.query<{ count: number }>(`
      update public.wonder_questions
      set ${countColumn} = greatest(0, ${countColumn} + $2)
      where id = $1::uuid returning ${countColumn} as count
    `, [input.questionId, delta])
    return { count: updated.rows[0]!.count, selected: input.selected }
  })
}

export async function setQuestionVote(input: {
  actor: WonderActor
  questionId: string
  value: -1 | 0 | 1
}) {
  return withWonderlandWriteTransaction({
    action: 'question-vote',
    identityHash: userIdentity(input.actor.id),
    limit: 300,
    windowSeconds: 86400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const question = await client.query<{ author_id: string }>(`
      select author_id from public.wonder_questions
      where id = $1::uuid and visibility = 'visible' for update
    `, [input.questionId])
    const current = question.rows[0]
    if (!current)
      throw new WonderlandError('问题不存在', 404, 'QUESTION_NOT_FOUND')
    if (current.author_id === input.actor.id)
      throw new WonderlandError('不能给自己的问题投票', 409, 'SELF_VOTE_FORBIDDEN')
    const existing = await client.query<{ value: number }>(`
      select value from public.wonder_question_votes
      where question_id = $1::uuid and user_id = $2::uuid for update
    `, [input.questionId, input.actor.id])
    const previous = existing.rows[0]?.value ?? 0
    if (input.value === 0) {
      await client.query(`delete from public.wonder_question_votes where question_id = $1::uuid and user_id = $2::uuid`, [input.questionId, input.actor.id])
    }
    else {
      await client.query(`
        insert into public.wonder_question_votes (question_id, user_id, value)
        values ($1::uuid, $2::uuid, $3)
        on conflict (question_id, user_id) do update set value = excluded.value
      `, [input.questionId, input.actor.id, input.value])
    }
    const delta = input.value - previous
    const updated = await client.query<{ vote_score: number }>(`
      update public.wonder_questions
      set vote_score = vote_score + $2, hot_score = hot_score + abs($2)
      where id = $1::uuid returning vote_score
    `, [input.questionId, delta])
    return { value: input.value, voteScore: updated.rows[0]!.vote_score }
  })
}

async function assertVisibleReportTarget(client: PoolClient, type: string, id: string) {
  const table = type === 'question' ? 'wonder_questions' : type === 'answer' ? 'wonder_answers' : 'wonder_comments'
  const result = await client.query(`select id from public.${table} where id = $1::uuid and visibility = 'visible'`, [id])
  if (!result.rowCount)
    throw new WonderlandError('举报内容不存在', 404, 'REPORT_TARGET_NOT_FOUND')
}

async function completeIdempotencyKey(
  client: PoolClient,
  actorId: string,
  action: string,
  key: string,
  resourceType: string,
  resourceId: string,
) {
  await client.query(`
    update public.wonder_idempotency_keys
    set resource_type = $4, resource_id = $5::uuid
    where actor_id = $1::uuid and action = $2 and key = $3::uuid
  `, [actorId, action, key, resourceType, resourceId])
}

async function createNotification(client: PoolClient, input: {
  actorId: string
  answerId?: string | null
  commentId?: string | null
  dedupeKey: string
  newsId?: string | null
  questionId?: string | null
  recipientId: string
  type: string
}) {
  await client.query(`
    insert into public.wonder_notifications (
      recipient_id, actor_id, type, question_id, answer_id, comment_id, news_id, dedupe_key
    ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8)
    on conflict (recipient_id, dedupe_key) do nothing
  `, [
    input.recipientId,
    input.actorId,
    input.type,
    input.questionId,
    input.answerId ?? null,
    input.commentId ?? null,
    input.newsId ?? null,
    input.dedupeKey,
  ])
}

function databaseCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined
}

function hashRequest(input: unknown) {
  return createHash('sha256').update(stableStringify(input)).digest('hex')
}

async function insertOrderedLinks(
  client: PoolClient,
  table: string,
  ownerColumn: string,
  targetColumn: string,
  ownerId: string,
  targetIds: string[],
) {
  for (const [position, targetId] of targetIds.entries()) {
    await client.query(`
      insert into public.${table} (${ownerColumn}, ${targetColumn}, position)
      values ($1::uuid, $2::uuid, $3)
    `, [ownerId, targetId, position])
  }
}

async function lockAndValidateFiles(client: PoolClient, fileIds: string[], ownerId: string) {
  if (!fileIds.length)
    return
  await requireAccountCapability(ownerId, 'upload')
  const result = await client.query<{ id: string, upload_session_id: string }>(`
    select id, upload_session_id from public.file_objects
    where id = any($1::uuid[])
      and owner_id = $2::uuid
      and status = 'ready'
      and visibility = 'private'
      and mime_type = any($3::text[])
      and size_bytes between 1 and 8388608
    for key share
  `, [fileIds, ownerId, ['image/png', 'image/jpeg', 'image/webp']])
  if (result.rowCount !== fileIds.length)
    throw new WonderlandError('图片不存在、尚未上传完成或不属于当前用户', 409, 'FILE_NOT_READY')

  const sessionIds = result.rows.map(file => file.upload_session_id)
  if (sessionIds.some(id => !id))
    throw new WonderlandError('图片上传来源无效，请重新上传', 409, 'FILE_UPLOAD_SCOPE_INVALID')
  const sessions = await getControlPool().query<{ file_object_id: string }>(`
    select file_object_id
    from control.upload_sessions
    where id = any($1::uuid[])
      and user_id = $2
      and status = 'completed'
      and scope = 'wonderland-image'
  `, [sessionIds, ownerId])
  const verified = new Set(sessions.rows.map(row => row.file_object_id))
  if (verified.size !== fileIds.length || fileIds.some(id => !verified.has(id)))
    throw new WonderlandError('图片上传用途无效，请重新上传', 409, 'FILE_UPLOAD_SCOPE_INVALID')
}

async function readCreatedAnswer(client: PoolClient, id: string) {
  const result = await client.query<{ id: string }>('select id from public.wonder_answers where id = $1::uuid', [id])
  if (!result.rows[0])
    throw new WonderlandError('幂等请求关联的回答不存在', 409, 'IDEMPOTENCY_RESOURCE_MISSING')
  return result.rows[0]
}

async function readCreatedQuestion(client: PoolClient, id: string) {
  const result = await client.query<{ id: string, slug: string }>(
    'select id, slug from public.wonder_questions where id = $1::uuid',
    [id],
  )
  if (!result.rows[0])
    throw new WonderlandError('幂等请求关联的问题不存在', 409, 'IDEMPOTENCY_RESOURCE_MISSING')
  return result.rows[0]
}

async function reserveIdempotencyKey(client: PoolClient, input: {
  action: string
  actorId: string
  key: string
  requestHash: string
}) {
  const inserted = await client.query(`
    insert into public.wonder_idempotency_keys (actor_id, action, key, request_hash)
    values ($1::uuid, $2, $3::uuid, $4)
    on conflict do nothing
    returning key
  `, [input.actorId, input.action, input.key, input.requestHash])
  if (inserted.rowCount)
    return null
  const existing = await client.query<{ request_hash: string, resource_id: string | null }>(`
    select request_hash, resource_id
    from public.wonder_idempotency_keys
    where actor_id = $1::uuid and action = $2 and key = $3::uuid
    for update
  `, [input.actorId, input.action, input.key])
  const row = existing.rows[0]
  if (!row || row.request_hash !== input.requestHash)
    throw new WonderlandError('幂等请求编号已被其他内容使用', 409, 'IDEMPOTENCY_CONFLICT')
  if (!row.resource_id)
    throw new WonderlandError('幂等请求仍在处理中', 409, 'IDEMPOTENCY_IN_PROGRESS')
  return row.resource_id
}

function stableStringify(input: unknown): string {
  if (Array.isArray(input))
    return `[${input.map(stableStringify).join(',')}]`
  if (input && typeof input === 'object') {
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`)
      .join(',')}}`
  }
  return JSON.stringify(input)
}

function userIdentity(userId: string) {
  return createSecurityHash('wonderland-user', userId)
}

async function validateQuestionTaxonomy(client: PoolClient, categoryId: string, tagIds: string[]) {
  const category = await client.query(`
    select id from public.wonder_categories
    where id = $1::uuid and scope = 'question' and is_active = true
  `, [categoryId])
  if (!category.rowCount)
    throw new WonderlandError('问题分类不存在或已停用', 409, 'CATEGORY_INACTIVE')
  if (!tagIds.length)
    return
  const tags = await client.query(`
    select id from public.wonder_tags where id = any($1::uuid[]) and is_active = true
  `, [tagIds])
  if (tags.rowCount !== tagIds.length)
    throw new WonderlandError('问题标签不存在或已停用', 409, 'TAG_INACTIVE')
}

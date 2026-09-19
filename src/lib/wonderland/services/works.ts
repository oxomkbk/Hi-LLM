import 'server-only'

import { createHash } from 'node:crypto'

import { requireAccountCapability } from '@/lib/auth/capabilities'
import { getControlPool } from '@/lib/db/control'
import { createSecurityHash } from '@/lib/security'

import { WonderlandError } from '../errors'
import { createWonderSlug } from '../validation'
import { withWonderlandWriteTransaction } from '../write-transaction'

import type { WonderlandDocument } from '../content'
import type { WonderActor, WonderWorkKind } from '../domain'
import type { PoolClient } from 'pg'

interface NormalizedWorkContent {
  document: WonderlandDocument
  fileIds: string[]
  text: string
}

export async function createWork(input: {
  actor: WonderActor
  content: NormalizedWorkContent
  coverFileId: string
  demoUrl: string | null
  idempotencyKey: string
  kind: WonderWorkKind
  sourceUrl: string
  summary: string
  tags: string[]
  title: string
}) {
  await requireAccountCapability(input.actor.id, 'publish-work')
  const requestHash = hashRequest({
    content: input.content.document,
    coverFileId: input.coverFileId,
    demoUrl: input.demoUrl,
    kind: input.kind,
    sourceUrl: input.sourceUrl,
    summary: input.summary,
    tags: input.tags,
    title: input.title,
  })

  return withWonderlandWriteTransaction({
    action: 'work-create',
    identityHash: userIdentity(input.actor.id),
    limit: 12,
    windowSeconds: 86_400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const previous = await reserveIdempotencyKey(client, input.actor.id, input.idempotencyKey, requestHash)
    if (previous)
      return readCreatedWork(client, previous)

    const allFileIds = [...new Set([input.coverFileId, ...input.content.fileIds])]
    await lockAndValidateWorkImages(client, allFileIds, input.actor.id)
    const result = await client.query<{ id: string, slug: string }>(`
      insert into public.wonder_works (
        slug, author_id, title, summary, kind, tags, source_url, demo_url,
        content_version, content_json, content_text, cover_file_id
      ) values ($1, $2::uuid, $3, $4, $5, $6::text[], $7, $8, 1, $9::jsonb, $10, $11::uuid)
      returning id, slug
    `, [
      createWonderSlug(input.title),
      input.actor.id,
      input.title,
      input.summary,
      input.kind,
      input.tags,
      input.sourceUrl,
      input.demoUrl,
      JSON.stringify(input.content.document),
      input.content.text,
      input.coverFileId,
    ])
    const created = result.rows[0]!
    for (const [position, fileId] of input.content.fileIds.entries()) {
      await client.query(`
        insert into public.wonder_work_files (work_id, file_id, position)
        values ($1::uuid, $2::uuid, $3)
      `, [created.id, fileId, position])
    }
    await completeIdempotencyKey(client, input.actor.id, input.idempotencyKey, created.id)
    await awardEligibleWorkBadges(client, input.actor.id)
    return created
  })
}

export async function recordWorkView(input: { identityHash: string, workId: string }) {
  return withWonderlandWriteTransaction({
    action: 'work-view',
    identityHash: input.identityHash,
    limit: 500,
    windowSeconds: 3_600,
  }, async (client) => {
    const bucketStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
    const inserted = await client.query<{ author_id: string }>(`
      with target as (
        select id, author_id from public.wonder_works
        where id = $1::uuid and visibility = 'visible'
      ), event as (
        insert into public.wonder_work_view_events (work_id, viewer_hash, bucket_start)
        select id, $2, $3 from target
        on conflict do nothing
        returning work_id
      )
      select target.author_id from target join event on event.work_id = target.id
    `, [input.workId, input.identityHash, bucketStart])
    const authorId = inserted.rows[0]?.author_id
    if (!authorId)
      return { recorded: false }
    await client.query(`
      update public.wonder_works set view_count = view_count + 1 where id = $1::uuid
    `, [input.workId])
    await awardEligibleWorkBadges(client, authorId)
    return { recorded: true }
  })
}

export async function toggleWorkLike(input: { actor: WonderActor, workId: string }) {
  return withWonderlandWriteTransaction({
    action: 'work-like',
    identityHash: userIdentity(input.actor.id),
    limit: 180,
    windowSeconds: 86_400,
  }, async (client) => {
    await ensureBusinessUser(input.actor, client)
    const work = await client.query<{ author_id: string, like_count: number }>(`
      select author_id, like_count from public.wonder_works
      where id = $1::uuid and visibility = 'visible'
      for update
    `, [input.workId])
    const current = work.rows[0]
    if (!current)
      throw new WonderlandError('作品不存在', 404, 'WORK_NOT_FOUND')
    const existing = await client.query(`
      select work_id from public.wonder_work_likes
      where work_id = $1::uuid and user_id = $2::uuid
    `, [input.workId, input.actor.id])
    const liked = !existing.rowCount
    if (liked) {
      await client.query(`
        insert into public.wonder_work_likes (work_id, user_id) values ($1::uuid, $2::uuid)
      `, [input.workId, input.actor.id])
    }
    else {
      await client.query(`
        delete from public.wonder_work_likes where work_id = $1::uuid and user_id = $2::uuid
      `, [input.workId, input.actor.id])
    }
    const updated = await client.query<{ like_count: number }>(`
      update public.wonder_works
      set like_count = greatest(0, like_count + $2)
      where id = $1::uuid
      returning like_count
    `, [input.workId, liked ? 1 : -1])
    await awardEligibleWorkBadges(client, current.author_id)
    return { likeCount: updated.rows[0]!.like_count, liked }
  })
}

async function awardEligibleWorkBadges(client: PoolClient, userId: string) {
  await client.query(`
    with metrics as (
      select
        count(*)::int as works_published,
        coalesce(sum(like_count), 0)::int as works_likes_received,
        coalesce(sum(view_count), 0)::int as works_views_received
      from public.wonder_works
      where author_id = $1::uuid and visibility = 'visible'
    ), eligible as (
      select badge.id, badge.criteria_type, badge.threshold
      from public.wonder_badges badge cross join metrics
      where badge.is_active = true and (
        (badge.criteria_type = 'works_published' and metrics.works_published >= badge.threshold)
        or (badge.criteria_type = 'works_likes_received' and metrics.works_likes_received >= badge.threshold)
        or (badge.criteria_type = 'works_views_received' and metrics.works_views_received >= badge.threshold)
      )
    )
    insert into public.wonder_user_badges (user_id, badge_id, metadata)
    select $1::uuid, id, jsonb_build_object('criteria', criteria_type, 'threshold', threshold)
    from eligible
    on conflict (user_id, badge_id) do nothing
  `, [userId])
}

async function completeIdempotencyKey(client: PoolClient, actorId: string, key: string, workId: string) {
  await client.query(`
    update public.wonder_idempotency_keys
    set resource_type = 'work', resource_id = $3::uuid
    where actor_id = $1::uuid and action = 'work.create' and key = $2::uuid
  `, [actorId, key, workId])
}

async function ensureBusinessUser(actor: WonderActor, client: PoolClient) {
  await client.query(`
    insert into public.app_users (id, email, status, display_name, avatar_url)
    values ($1::uuid, $2, 'active', $3, $4)
    on conflict (id) do update set
      email = excluded.email,
      status = 'active',
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = now()
  `, [actor.id, actor.email.toLowerCase(), actor.name ?? null, actor.image ?? null])
}

function hashRequest(input: unknown) {
  return createHash('sha256').update(stableStringify(input)).digest('hex')
}

async function lockAndValidateWorkImages(client: PoolClient, fileIds: string[], ownerId: string) {
  if (!fileIds.length)
    throw new WonderlandError('请上传作品封面', 400, 'WORK_COVER_REQUIRED')
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
  const sessions = await getControlPool().query<{ file_object_id: string }>(`
    select file_object_id from control.upload_sessions
    where id = any($1::uuid[])
      and user_id = $2 and status = 'completed' and scope in ('wonderland-image', 'wonderland-work-image')
  `, [result.rows.map(file => file.upload_session_id), ownerId])
  const verified = new Set(sessions.rows.map(row => row.file_object_id))
  if (verified.size !== fileIds.length || fileIds.some(id => !verified.has(id)))
    throw new WonderlandError('图片上传用途无效，请重新上传', 409, 'FILE_UPLOAD_SCOPE_INVALID')
}

async function readCreatedWork(client: PoolClient, id: string) {
  const result = await client.query<{ id: string, slug: string }>(`
    select id, slug from public.wonder_works where id = $1::uuid
  `, [id])
  if (!result.rows[0])
    throw new WonderlandError('幂等请求关联的作品不存在', 409, 'IDEMPOTENCY_RESOURCE_MISSING')
  return result.rows[0]
}

async function reserveIdempotencyKey(client: PoolClient, actorId: string, key: string, requestHash: string) {
  const inserted = await client.query(`
    insert into public.wonder_idempotency_keys (actor_id, action, key, request_hash)
    values ($1::uuid, 'work.create', $2::uuid, $3)
    on conflict do nothing returning key
  `, [actorId, key, requestHash])
  if (inserted.rowCount)
    return null
  const existing = await client.query<{ request_hash: string, resource_id: string | null }>(`
    select request_hash, resource_id from public.wonder_idempotency_keys
    where actor_id = $1::uuid and action = 'work.create' and key = $2::uuid
    for update
  `, [actorId, key])
  const row = existing.rows[0]
  if (!row || row.request_hash !== requestHash)
    throw new WonderlandError('幂等请求编号已被其他内容使用', 409, 'IDEMPOTENCY_CONFLICT')
  if (!row.resource_id)
    throw new WonderlandError('作品仍在发布中', 409, 'IDEMPOTENCY_IN_PROGRESS')
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

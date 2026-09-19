import 'server-only'

import { cache } from 'react'

import { queryBusiness } from '@/lib/db/business'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { isUuid } from '@/lib/security'

import { readProfileAppearanceState } from './appearance-service'
import { AccountProfileValidationError, parseAccountProfileInput } from './validation'

import type {
  CommunityStats,
  CommunitySummary,
  DataSlice,
  PrivateAccountData,
  PublicAccountData,
  RecentAnswer,
  RecentQuestion,
  RecentWork,
} from './profile-types'
import type { WonderBadgeProgress } from '@/lib/wonderland/domain'
import type { PoolClient } from 'pg'

interface AccountRow {
  avatarFileId: string | null
  bio: string | null
  canAnswer: boolean
  canAsk: boolean
  canComment: boolean
  canPublishWorks: boolean
  canUpload: boolean
  createdAt: Date
  email: string
  emailVerified: boolean
  id: string
  image: string | null
  lastSessionAt: Date | null
  loginMethods: string[]
  name: string
  role: 'admin' | 'user'
  sessionCount: number
  status: 'active' | 'disabled'
  updatedAt: Date
  website: string | null
}

interface PublicAccountRow {
  bio: string | null
  createdAt: Date
  id: string
  image: string | null
  name: string
  website: string | null
}

export class AccountProfileError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'ACCOUNT_PROFILE_INVALID') {
    super(message)
  }
}

export async function getPrivateAccount(userId: string): Promise<PrivateAccountData> {
  const account = await readPrivateAccount(userId)
  if (!account || account.status !== 'active')
    throw new AccountProfileError('账号不存在或不可用', 404, 'ACCOUNT_NOT_FOUND')
  const [appearanceState, community] = await Promise.all([
    readProfileAppearanceState(userId),
    readOwnerCommunitySummary(userId),
  ])
  return {
    appearance: appearanceState.appearance,
    appearanceConfigured: appearanceState.configured,
    community,
    user: serializePrivateAccount(account),
  }
}

async function readPublicAccount(userId: string): Promise<PublicAccountData | null> {
  if (!isUuid(userId))
    return null
  const result = await getControlPool().query<PublicAccountRow>(`
    select
      id, name, image, bio, website,
      "createdAt" as "createdAt"
    from auth."user"
    where id = $1 and status = 'active'
  `, [userId])
  const account = result.rows[0]
  if (!account)
    return null
  const [appearanceState, community] = await Promise.all([
    readProfileAppearanceState(userId),
    readPublicCommunitySummary(userId),
  ])
  return {
    appearance: appearanceState.appearance,
    community,
    user: {
      ...account,
      createdAt: account.createdAt.toISOString(),
    },
  }
}

export const getPublicAccount = cache(readPublicAccount)

export async function updateAccountProfile(userId: string, rawInput: unknown) {
  let input
  try {
    input = parseAccountProfileInput(rawInput)
  }
  catch (error) {
    if (error instanceof AccountProfileValidationError)
      throw new AccountProfileError(error.message)
    throw error
  }
  const account = await withControlTransaction(async (client) => {
    const current = await client.query<{
      avatarFileId: string | null
      email: string
      id: string
      status: string
    }>(`
      select id, email, status, "avatarFileId" as "avatarFileId"
      from auth."user"
      where id = $1
      for update
    `, [userId])
    const user = current.rows[0]
    if (!user || user.status !== 'active')
      throw new AccountProfileError('账号不存在或不可用', 404, 'ACCOUNT_NOT_FOUND')

    let image: string | null = null
    if (input.avatarFileId) {
      const avatar = await client.query<{ id: string }>(`
        select avatar.id
        from control.user_avatar_files avatar
        join control.upload_sessions upload on upload.id = avatar.upload_session_id
        where avatar.id = $1::uuid
          and avatar.owner_user_id = $2
          and avatar.status = 'ready'
          and upload.user_id = $2
          and upload.file_object_id = avatar.id
          and upload.scope = 'user-avatar'
          and upload.status = 'completed'
        for key share of avatar
      `, [input.avatarFileId, userId])
      if (!avatar.rowCount)
        throw new AccountProfileError('头像尚未上传完成或不属于当前账号', 409, 'AVATAR_NOT_READY')
      image = `/api/avatars/${input.avatarFileId}`
    }

    if (user.avatarFileId && user.avatarFileId !== input.avatarFileId) {
      await client.query(`
        update control.user_avatar_files
        set owner_user_id = null, orphaned_at = coalesce(orphaned_at, now())
        where id = $1::uuid and owner_user_id = $2
      `, [user.avatarFileId, userId])
    }

    await client.query(`
      update auth."user"
      set name = $2,
          bio = $3,
          website = $4,
          image = $5,
          "avatarFileId" = $6::uuid
      where id = $1
    `, [userId, input.name, input.bio, input.website, image, input.avatarFileId])
    await writeAccountAudit(client, userId, 'account.profile.update', 'ACCOUNT_PROFILE_UPDATED', {
      avatarChanged: user.avatarFileId !== input.avatarFileId,
      hasBio: Boolean(input.bio),
      hasWebsite: Boolean(input.website),
    })
    return { email: user.email, image, name: input.name }
  })

  await syncBusinessProfile({ id: userId, ...account }).catch((error) => {
    console.error('同步业务库用户资料失败', error instanceof Error ? { message: error.message } : { type: typeof error })
  })
  return getPrivateAccount(userId)
}

async function readCommunitySlice<T>(label: string, reader: () => Promise<T>): Promise<DataSlice<T>> {
  try {
    return { data: await reader(), status: 'ready' }
  }
  catch (error) {
    console.error(`读取用户社区${label}失败`, error instanceof Error ? { message: error.message } : { type: typeof error })
    return { status: 'error' }
  }
}

async function readOwnerCommunitySummary(userId: string): Promise<CommunitySummary> {
  return readVisibleCommunitySummary(userId)
}

async function readPrivateAccount(userId: string) {
  const result = await getControlPool().query<AccountRow>(`
    with session_stats as (
      select
        "userId" as user_id,
        count(*) filter (where "expiresAt" > now())::int as session_count,
        max("updatedAt") as last_session_at
      from auth."session"
      where "userId" = $1
      group by "userId"
    ), account_stats as (
      select
        "userId" as user_id,
        array_agg(distinct "providerId" order by "providerId") as login_methods
      from auth.account
      where "userId" = $1
      group by "userId"
    )
    select
      u.id, u.name, u.email,
      u."emailVerified" as "emailVerified",
      u.image, u.bio, u.website,
      u."avatarFileId" as "avatarFileId",
      u.role, u.status,
      u."canAsk" as "canAsk",
      u."canAnswer" as "canAnswer",
      u."canComment" as "canComment",
      u."canPublishWorks" as "canPublishWorks",
      u."canUpload" as "canUpload",
      u."createdAt" as "createdAt",
      u."updatedAt" as "updatedAt",
      coalesce(session_stats.session_count, 0)::int as "sessionCount",
      session_stats.last_session_at as "lastSessionAt",
      coalesce(account_stats.login_methods, '{}'::text[]) as "loginMethods"
    from auth."user" u
    left join session_stats on session_stats.user_id = u.id
    left join account_stats on account_stats.user_id = u.id
    where u.id = $1
  `, [userId])
  return result.rows[0] ?? null
}

async function readPublicCommunitySummary(userId: string): Promise<CommunitySummary> {
  return readVisibleCommunitySummary(userId)
}

async function readVisibleCommunitySummary(userId: string): Promise<CommunitySummary> {
  const [stats, recentQuestions, recentAnswers, recentWorks, badges] = await Promise.all([
    readCommunitySlice('统计', async (): Promise<CommunityStats> => {
      const result = await queryBusiness<{
        answer_count: string
        comment_count: string
        question_count: string
        work_count: string
        work_like_count: string
        work_view_count: string
      }>(`
        select
          (select count(*)::text
           from public.wonder_questions question
           where question.author_id = $1::uuid and question.visibility = 'visible') as question_count,
          (select count(*)::text
           from public.wonder_answers answer
           join public.wonder_questions question on question.id = answer.question_id
           where answer.author_id = $1::uuid
             and answer.visibility = 'visible' and question.visibility = 'visible') as answer_count,
          (select count(*)::text
           from public.wonder_comments comment
           left join public.wonder_questions question on question.id = comment.question_id
           left join public.wonder_answers answer on answer.id = comment.answer_id
           left join public.wonder_news_articles news on news.id = comment.news_id
           where comment.author_id = $1::uuid
             and comment.visibility = 'visible'
             and (answer.id is null or answer.visibility = 'visible')
             and (
               (question.id is not null and question.visibility = 'visible')
               or (news.id is not null and news.status = 'published' and news.published_at <= now())
             )) as comment_count,
          (select count(*)::text
           from public.wonder_works work
           where work.author_id = $1::uuid and work.visibility = 'visible') as work_count,
          (select coalesce(sum(work.like_count), 0)::text
           from public.wonder_works work
           where work.author_id = $1::uuid and work.visibility = 'visible') as work_like_count,
          (select coalesce(sum(work.view_count), 0)::text
           from public.wonder_works work
           where work.author_id = $1::uuid and work.visibility = 'visible') as work_view_count
      `, [userId])
      const row = result.rows[0]
      return {
        contributions: {
          answers: Number(row?.answer_count ?? 0),
          comments: Number(row?.comment_count ?? 0),
          questions: Number(row?.question_count ?? 0),
          works: Number(row?.work_count ?? 0),
        },
        workImpact: {
          likes: Number(row?.work_like_count ?? 0),
          views: Number(row?.work_view_count ?? 0),
        },
      }
    }),
    readCommunitySlice('最近提问', async (): Promise<RecentQuestion[]> => {
      const result = await queryBusiness<{
        accepted_answer_id: string | null
        answer_count: number
        created_at: Date
        id: string
        is_closed: boolean
        slug: string
        title: string
        view_count: number
      }>(`
        select id, slug, title, answer_count, view_count, accepted_answer_id, is_closed, created_at
        from public.wonder_questions
        where author_id = $1::uuid and visibility = 'visible'
        order by created_at desc, id desc
        limit 6
      `, [userId])
      return result.rows.map(question => ({
        acceptedAnswerId: question.accepted_answer_id,
        answerCount: Number(question.answer_count),
        createdAt: question.created_at.toISOString(),
        id: question.id,
        isClosed: question.is_closed,
        slug: question.slug,
        title: question.title,
        viewCount: Number(question.view_count),
      }))
    }),
    readCommunitySlice('最近回答', async (): Promise<RecentAnswer[]> => {
      const result = await queryBusiness<{
        created_at: Date
        id: string
        is_accepted: boolean
        question_slug: string
        question_title: string
        vote_score: number
      }>(`
        select
          answer.id,
          answer.created_at,
          answer.vote_score,
          (question.accepted_answer_id = answer.id) as is_accepted,
          question.slug as question_slug,
          question.title as question_title
        from public.wonder_answers answer
        join public.wonder_questions question on question.id = answer.question_id
        where answer.author_id = $1::uuid
          and answer.visibility = 'visible'
          and question.visibility = 'visible'
        order by answer.created_at desc, answer.id desc
        limit 6
      `, [userId])
      return result.rows.map(answer => ({
        createdAt: answer.created_at.toISOString(),
        id: answer.id,
        isAccepted: answer.is_accepted,
        question: { slug: answer.question_slug, title: answer.question_title },
        voteScore: Number(answer.vote_score),
      }))
    }),
    readCommunitySlice('最近作品', async (): Promise<RecentWork[]> => {
      const result = await queryBusiness<{
        cover_file_id: string
        featured: boolean
        id: string
        kind: string
        like_count: number
        published_at: Date
        slug: string
        summary: string
        title: string
        view_count: number
      }>(`
        select id, slug, title, summary, kind, cover_file_id, featured, like_count, view_count, published_at
        from public.wonder_works
        where author_id = $1::uuid and visibility = 'visible'
        order by featured desc, published_at desc, id desc
        limit 6
      `, [userId])
      return result.rows.map(work => ({
        coverFileId: work.cover_file_id,
        featured: work.featured,
        id: work.id,
        kind: work.kind,
        likeCount: Number(work.like_count),
        publishedAt: work.published_at.toISOString(),
        slug: work.slug,
        summary: work.summary,
        title: work.title,
        viewCount: Number(work.view_count),
      }))
    }),
    readCommunitySlice('成就', async (): Promise<WonderBadgeProgress[]> => {
      const result = await queryBusiness<{
        awarded_at: Date | null
        description: string
        earned: boolean
        icon: WonderBadgeProgress['icon']
        id: string
        name: string
        progress: number
        slug: string
        threshold: number
        tone: WonderBadgeProgress['tone']
      }>(`
        with metrics as (
          select
            count(*)::int as works_published,
            coalesce(sum(like_count), 0)::int as works_likes_received,
            coalesce(sum(view_count), 0)::int as works_views_received
          from public.wonder_works
          where author_id = $1::uuid and visibility = 'visible'
        )
        select badge.id, badge.slug, badge.name, badge.description, badge.icon, badge.tone,
          badge.threshold, awarded.awarded_at, (awarded.badge_id is not null) as earned,
          case badge.criteria_type
            when 'works_published' then metrics.works_published
            when 'works_likes_received' then metrics.works_likes_received
            when 'works_views_received' then metrics.works_views_received
          end::int as progress
        from public.wonder_badges badge
        cross join metrics
        left join public.wonder_user_badges awarded
          on awarded.badge_id = badge.id and awarded.user_id = $1::uuid
        where badge.is_active = true
        order by badge.sort desc, badge.threshold, badge.id
      `, [userId])
      return result.rows.map(badge => ({
        ...badge,
        awarded_at: badge.awarded_at?.toISOString() ?? null,
      }))
    }),
  ])

  return { badges, recentAnswers, recentQuestions, recentWorks, stats }
}

function serializePrivateAccount(account: AccountRow) {
  return {
    ...account,
    createdAt: account.createdAt.toISOString(),
    lastSessionAt: account.lastSessionAt?.toISOString() ?? null,
    loginMethods: account.loginMethods ?? [],
    sessionCount: Number(account.sessionCount),
    updatedAt: account.updatedAt.toISOString(),
  }
}

async function syncBusinessProfile(user: { email: string, id: string, image: string | null, name: string }) {
  await queryBusiness(`
    insert into public.app_users (id, email, status, display_name, avatar_url)
    values ($1::uuid, $2, 'active', $3, $4)
    on conflict (id) do update
      set email = excluded.email,
          status = 'active',
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          updated_at = now()
  `, [user.id, user.email.toLowerCase(), user.name, user.image])
}

async function writeAccountAudit(
  client: PoolClient,
  actorId: string,
  action: string,
  code: string,
  metadata: Record<string, unknown>,
) {
  await client.query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values ($1, $2, 'user', $1, true, $3, $4::jsonb)
  `, [actorId, action, code, JSON.stringify(metadata)])
}

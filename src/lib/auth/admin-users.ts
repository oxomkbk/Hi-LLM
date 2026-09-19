import 'server-only'

import { randomUUID } from 'node:crypto'

import { hashPassword } from 'better-auth/crypto'

import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH, isStrongPassword } from '@/lib/auth/password-policy'
import { databaseErrorCode, queryBusiness } from '@/lib/db/business'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { isUuid } from '@/lib/security'

import type { AdminUserRole, AdminUserSaveInput, AdminUserStatus } from '@/types'
import type { PoolClient } from 'pg'

const USER_ROLES = new Set<AdminUserRole>(['admin', 'user'])
const USER_STATUSES = new Set<AdminUserStatus>(['active', 'disabled'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

interface LockedUser {
  avatarFileId: string | null
  canAnswer: boolean
  canAsk: boolean
  canComment: boolean
  canPublishWorks: boolean
  canUpload: boolean
  email: string
  emailVerified: boolean
  id: string
  image: string | null
  name: string
  role: AdminUserRole
  status: AdminUserStatus
}

interface UserActivityRow {
  answers: string
  comments: string
  lastContributionAt: Date | null
  questions: string
  total: string
  userId: string
  works: string
}

interface UserRow {
  avatarFileId: string | null
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
  loginMethods: string[] | null
  name: string
  role: AdminUserRole
  sessionCount: number
  status: AdminUserStatus
  updatedAt: Date
}

interface UserSummaryRow {
  active: string
  activeLast7Days: string
  administrators: string
  disabled: string
  newLast30Days: string
  total: string
}

export class AdminUserError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'ADMIN_USER_INVALID') {
    super(message)
  }
}

export async function createAdminUser(rawInput: unknown, actorId: string) {
  const input = parseAdminUserInput(rawInput, true)
  const password = input.password!
  const passwordHash = await hashPassword(password)
  const userId = randomUUID()

  try {
    await withControlTransaction(async (client) => {
      await client.query(`
        insert into auth."user" (
          id, name, email, "emailVerified", image, role, status,
          "canAsk", "canAnswer", "canComment", "canPublishWorks", "canUpload"
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        userId,
        input.name,
        input.email,
        input.emailVerified,
        input.image || null,
        input.role,
        input.status,
        input.canAsk,
        input.canAnswer,
        input.canComment,
        input.canPublishWorks,
        input.canUpload,
      ])
      await client.query(`
        insert into auth.account (
          id, "accountId", "providerId", "userId", password
        ) values ($1, $2, 'credential', $2, $3)
      `, [randomUUID(), userId, passwordHash])
      await writeUserAudit(client, actorId, 'user.create', userId, 'USER_CREATED', {
        capabilities: capabilityAudit(input),
        role: input.role,
        status: input.status,
      })
    })
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      throw new AdminUserError('该邮箱已经存在', 409, 'USER_EMAIL_EXISTS')
    throw error
  }

  return { id: userId }
}

export async function deleteAdminUser(id: string, actorId: string) {
  if (!isUuid(id))
    throw new AdminUserError('用户编号无效')
  if (actorId === id)
    throw new AdminUserError('不能删除自己的账号', 409, 'CANNOT_DELETE_SELF')

  await withControlTransaction(async (client) => {
    await lockUserManagement(client)
    const target = await findLockedUser(client, id)
    if (!target)
      throw new AdminUserError('用户不存在', 404, 'USER_NOT_FOUND')
    await assertAdminContinuity(client, target, null)
    await client.query(`
      update control.user_avatar_files
      set owner_user_id = null, orphaned_at = coalesce(orphaned_at, now())
      where owner_user_id = $1
    `, [id])
    await client.query(`
      update auth."user" set "avatarFileId" = null, image = null where id = $1
    `, [id])
    await client.query(`delete from auth."user" where id = $1`, [id])
    await writeUserAudit(client, actorId, 'user.delete', id, 'USER_DELETED', {
      role: target.role,
      status: target.status,
    })
  })

  return { id }
}

export async function listAdminUsers(input: {
  currentUserId: string
  pageIndex: number
  pageSize: number
  q?: string
  role?: AdminUserRole
  status?: AdminUserStatus
}) {
  const filters: string[] = []
  const values: unknown[] = []

  if (input.q) {
    values.push(`%${escapeLike(input.q)}%`)
    filters.push(`(u.name ilike $${values.length} escape '\\' or u.email ilike $${values.length} escape '\\')`)
  }
  if (input.role) {
    values.push(input.role)
    filters.push(`u.role = $${values.length}`)
  }
  if (input.status) {
    values.push(input.status)
    filters.push(`u.status = $${values.length}`)
  }

  const where = filters.length ? `where ${filters.join(' and ')}` : ''
  const listValues = [...values, input.pageSize, input.pageIndex * input.pageSize]
  const pool = getControlPool()
  const [count, users, summary] = await Promise.all([
    pool.query<{ total: string }>(`
      select count(*)::text as total
      from auth."user" u
      ${where}
    `, values),
    pool.query<UserRow>(`
      with session_stats as (
        select
          "userId" as user_id,
          count(*) filter (where "expiresAt" > now())::int as session_count,
          max("updatedAt") as last_session_at
        from auth."session"
        group by "userId"
      ), account_stats as (
        select
          "userId" as user_id,
          array_agg(distinct "providerId" order by "providerId") as login_methods
        from auth.account
        group by "userId"
      )
      select
        u.id,
        u.name,
        u.email,
        u."emailVerified" as "emailVerified",
        u.image,
        u."avatarFileId" as "avatarFileId",
        u.role,
        u.status,
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
      ${where}
      order by u."createdAt" desc, u.id desc
      limit $${listValues.length - 1} offset $${listValues.length}
    `, listValues),
    pool.query<UserSummaryRow>(`
      select
        count(*)::text as total,
        count(*) filter (where status = 'active')::text as active,
        count(*) filter (where status = 'disabled')::text as disabled,
        count(*) filter (where role = 'admin' and status = 'active')::text as administrators,
        count(*) filter (where "createdAt" >= now() - interval '30 days')::text as "newLast30Days",
        count(*) filter (where exists (
          select 1
          from auth."session" s
          where s."userId" = u.id
            and s."updatedAt" >= now() - interval '7 days'
        ))::text as "activeLast7Days"
      from auth."user" u
    `),
  ])
  const activities = await loadUserActivity(users.rows.map(user => user.id))
  const summaryRow = summary.rows[0]

  return {
    currentUserId: input.currentUserId,
    list: users.rows.map(user => serializeUser(user, activities.get(user.id))),
    page: input.pageIndex + 1,
    pageSize: input.pageSize,
    summary: {
      active: Number(summaryRow?.active ?? 0),
      activeLast7Days: Number(summaryRow?.activeLast7Days ?? 0),
      administrators: Number(summaryRow?.administrators ?? 0),
      disabled: Number(summaryRow?.disabled ?? 0),
      newLast30Days: Number(summaryRow?.newLast30Days ?? 0),
      total: Number(summaryRow?.total ?? 0),
    },
    total: Number(count.rows[0]?.total ?? 0),
  }
}

export function parseAdminUserRole(value: string | null) {
  if (!value)
    return undefined
  if (!USER_ROLES.has(value as AdminUserRole))
    throw new AdminUserError('用户角色筛选无效')
  return value as AdminUserRole
}

export function parseAdminUserStatus(value: string | null) {
  if (!value)
    return undefined
  if (!USER_STATUSES.has(value as AdminUserStatus))
    throw new AdminUserError('用户状态筛选无效')
  return value as AdminUserStatus
}

export async function updateAdminUser(id: string, rawInput: unknown, actorId: string) {
  if (!isUuid(id))
    throw new AdminUserError('用户编号无效')
  const input = parseAdminUserInput(rawInput, false)
  if (actorId === id && input.role !== 'admin')
    throw new AdminUserError('不能移除自己的管理员权限', 409, 'CANNOT_DEMOTE_SELF')
  if (actorId === id && input.status !== 'active')
    throw new AdminUserError('不能停用自己的账号', 409, 'CANNOT_DISABLE_SELF')
  if (actorId === id && !input.emailVerified)
    throw new AdminUserError('不能取消自己邮箱的验证状态', 409, 'CANNOT_UNVERIFY_SELF')
  if (actorId === id && input.password)
    throw new AdminUserError('请通过账号安全功能修改自己的密码', 409, 'CANNOT_RESET_SELF_PASSWORD')

  const passwordHash = input.password ? await hashPassword(input.password) : null

  try {
    await withControlTransaction(async (client) => {
      await lockUserManagement(client)
      const target = await findLockedUser(client, id)
      if (!target)
        throw new AdminUserError('用户不存在', 404, 'USER_NOT_FOUND')

      await assertAdminContinuity(client, target, input)
      const roleChanged = target.role !== input.role
      const statusChanged = target.status !== input.status
      const permissionChanged = target.canAsk !== input.canAsk
        || target.canAnswer !== input.canAnswer
        || target.canComment !== input.canComment
        || target.canPublishWorks !== input.canPublishWorks
        || target.canUpload !== input.canUpload
      const keepsLocalAvatar = Boolean(target.avatarFileId && input.image === target.image)
      if (input.image.startsWith('/api/avatars/') && !keepsLocalAvatar)
        throw new AdminUserError('不能把其他用户的本地头像分配给该账号', 409, 'AVATAR_REFERENCE_FORBIDDEN')
      if (target.avatarFileId && !keepsLocalAvatar) {
        await client.query(`
          update control.user_avatar_files
          set owner_user_id = null, orphaned_at = coalesce(orphaned_at, now())
          where id = $1::uuid and owner_user_id = $2
        `, [target.avatarFileId, id])
      }

      await client.query(`
        update auth."user"
        set name = $2,
            email = $3,
            "emailVerified" = $4,
            image = $5,
            role = $6,
            status = $7,
            "avatarFileId" = $8::uuid,
            "canAsk" = $9,
            "canAnswer" = $10,
            "canComment" = $11,
            "canPublishWorks" = $12,
            "canUpload" = $13
        where id = $1
      `, [
        id,
        input.name,
        input.email,
        input.emailVerified,
        input.image || null,
        input.role,
        input.status,
        keepsLocalAvatar ? target.avatarFileId : null,
        input.canAsk,
        input.canAnswer,
        input.canComment,
        input.canPublishWorks,
        input.canUpload,
      ])

      if (passwordHash) {
        const updated = await client.query(`
          update auth.account
          set password = $2, "updatedAt" = now()
          where "userId" = $1 and "providerId" = 'credential'
        `, [id, passwordHash])
        if (!updated.rowCount) {
          await client.query(`
            insert into auth.account (
              id, "accountId", "providerId", "userId", password
            ) values ($1, $2, 'credential', $2, $3)
          `, [randomUUID(), id, passwordHash])
        }
      }

      if (roleChanged || statusChanged || permissionChanged || passwordHash)
        await client.query(`delete from auth."session" where "userId" = $1`, [id])

      await writeUserAudit(client, actorId, 'user.update', id, 'USER_UPDATED', {
        emailVerified: input.emailVerified,
        capabilities: capabilityAudit(input),
        permissionsChanged: permissionChanged,
        passwordReset: Boolean(passwordHash),
        role: input.role,
        status: input.status,
      })
    })
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      throw new AdminUserError('该邮箱已经存在', 409, 'USER_EMAIL_EXISTS')
    throw error
  }

  return { id }
}

async function assertAdminContinuity(client: PoolClient, target: LockedUser, next: AdminUserSaveInput | null) {
  const removesActiveAdmin = target.role === 'admin'
    && target.status === 'active'
    && (!next || next.role !== 'admin' || next.status !== 'active')
  if (!removesActiveAdmin)
    return

  const result = await client.query<{ exists: boolean }>(`
    select exists (
      select 1 from auth."user"
      where id <> $1 and role = 'admin' and status = 'active'
    ) as exists
  `, [target.id])
  if (!result.rows[0]?.exists)
    throw new AdminUserError('系统至少需要保留一个可用管理员', 409, 'LAST_ADMIN_REQUIRED')
}

function capabilityAudit(input: Pick<AdminUserSaveInput, 'canAnswer' | 'canAsk' | 'canComment' | 'canPublishWorks' | 'canUpload'>) {
  return {
    answer: input.canAnswer,
    ask: input.canAsk,
    comment: input.canComment,
    publishWork: input.canPublishWorks,
    upload: input.canUpload,
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

async function findLockedUser(client: PoolClient, id: string) {
  const result = await client.query<LockedUser>(`
    select
      id, name, email, "emailVerified" as "emailVerified", image,
      "avatarFileId" as "avatarFileId", role, status,
      "canAsk" as "canAsk", "canAnswer" as "canAnswer",
      "canComment" as "canComment", "canPublishWorks" as "canPublishWorks",
      "canUpload" as "canUpload"
    from auth."user"
    where id = $1
    for update
  `, [id])
  return result.rows[0] ?? null
}

async function loadUserActivity(userIds: string[]) {
  const result = new Map<string, UserActivityRow>()
  if (!userIds.length)
    return result

  try {
    const activity = await queryBusiness<UserActivityRow>(`
      with contributions as (
        select author_id, count(*)::bigint as questions, 0::bigint as answers,
               0::bigint as comments, 0::bigint as works, max(created_at) as last_at
        from public.wonder_questions
        where author_id = any($1::uuid[]) and visibility <> 'deleted'
        group by author_id
        union all
        select author_id, 0, count(*), 0, 0, max(created_at)
        from public.wonder_answers
        where author_id = any($1::uuid[]) and visibility <> 'deleted'
        group by author_id
        union all
        select author_id, 0, 0, count(*), 0, max(created_at)
        from public.wonder_comments
        where author_id = any($1::uuid[]) and visibility <> 'deleted'
        group by author_id
        union all
        select author_id, 0, 0, 0, count(*), max(published_at)
        from public.wonder_works
        where author_id = any($1::uuid[]) and visibility <> 'deleted'
        group by author_id
      )
      select
        author_id::text as "userId",
        sum(questions)::text as questions,
        sum(answers)::text as answers,
        sum(comments)::text as comments,
        sum(works)::text as works,
        sum(questions + answers + comments + works)::text as total,
        max(last_at) as "lastContributionAt"
      from contributions
      group by author_id
    `, [userIds])
    for (const row of activity.rows)
      result.set(row.userId, row)
  }
  catch (error) {
    console.error('后台用户贡献数据加载失败', {
      code: databaseErrorCode(error),
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  }

  return result
}

async function lockUserManagement(client: PoolClient) {
  await client.query(`select pg_advisory_xact_lock(hashtext('hillm-nav:admin-users'))`)
}

function parseAdminUserInput(value: unknown, passwordRequired: boolean): AdminUserSaveInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AdminUserError('用户资料格式无效')
  const input = value as Record<string, unknown>
  const name = readText(input.name, 100, '姓名', true)
  const email = readText(input.email, 254, '邮箱', true).toLowerCase()
  if (!EMAIL_PATTERN.test(email))
    throw new AdminUserError('请输入有效的邮箱地址')
  if (!USER_ROLES.has(input.role as AdminUserRole))
    throw new AdminUserError('请选择有效的用户角色')
  if (!USER_STATUSES.has(input.status as AdminUserStatus))
    throw new AdminUserError('请选择有效的用户状态')

  const image = readText(input.image, 2_048, '头像地址')
  if (image) {
    if (/^\/api\/avatars\/[0-9a-f-]{36}$/i.test(image)) {
      if (passwordRequired)
        throw new AdminUserError('新用户不能引用其他账号的本地头像')
      // 更新时仅允许保留该用户已有的本地头像，归属校验在锁定用户后完成。
    }
    else {
      try {
        const url = new URL(image)
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('invalid protocol')
      }
      catch {
        throw new AdminUserError('头像地址必须是有效的 HTTPS 链接')
      }
    }
  }

  const password = readPassword(input.password)
  if (passwordRequired && !password)
    throw new AdminUserError('请设置初始密码')
  if (password && !isStrongPassword(password))
    throw new AdminUserError(`密码长度应为 ${AUTH_MIN_PASSWORD_LENGTH}–64 个字符，且必须包含大小写字母和数字`)

  return {
    canAnswer: readBoolean(input.canAnswer, '回答权限'),
    canAsk: readBoolean(input.canAsk, '提问权限'),
    canComment: readBoolean(input.canComment, '评论权限'),
    canPublishWorks: readBoolean(input.canPublishWorks, '作品发布权限'),
    canUpload: readBoolean(input.canUpload, '上传权限'),
    email,
    emailVerified: input.emailVerified === true,
    image,
    name,
    password: password || undefined,
    role: input.role as AdminUserRole,
    status: input.status as AdminUserStatus,
  }
}

function readBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean')
    throw new AdminUserError(`${label}格式无效`)
  return value
}

function readPassword(value: unknown) {
  value ??= ''
  if (typeof value !== 'string')
    throw new AdminUserError('密码格式无效')
  if (value.length > AUTH_MAX_PASSWORD_LENGTH)
    throw new AdminUserError(`密码不能超过 ${AUTH_MAX_PASSWORD_LENGTH} 个字符`)
  return value
}

function readText(value: unknown, maxLength: number, label: string, required = false) {
  value ??= ''
  if (typeof value !== 'string')
    throw new AdminUserError(`${label}格式无效`)
  const result = value.trim()
  if (required && !result)
    throw new AdminUserError(`请填写${label}`)
  if (result.length > maxLength)
    throw new AdminUserError(`${label}不能超过 ${maxLength} 个字符`)
  return result
}

function serializeUser(user: UserRow, activity?: UserActivityRow) {
  return {
    ...user,
    activity: {
      answers: Number(activity?.answers ?? 0),
      comments: Number(activity?.comments ?? 0),
      lastContributionAt: activity?.lastContributionAt?.toISOString() ?? null,
      questions: Number(activity?.questions ?? 0),
      total: Number(activity?.total ?? 0),
      works: Number(activity?.works ?? 0),
    },
    createdAt: user.createdAt.toISOString(),
    lastSessionAt: user.lastSessionAt?.toISOString() ?? null,
    loginMethods: user.loginMethods ?? [],
    sessionCount: Number(user.sessionCount),
    updatedAt: user.updatedAt.toISOString(),
  }
}

async function writeUserAudit(
  client: PoolClient,
  actorId: string,
  action: string,
  resourceId: string,
  code: string,
  metadata: Record<string, unknown>,
) {
  await client.query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values ($1, $2, 'user', $3, true, $4, $5::jsonb)
  `, [actorId, action, resourceId, code, JSON.stringify(metadata)])
}

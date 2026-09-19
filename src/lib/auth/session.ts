import 'server-only'

import { headers } from 'next/headers'

import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { optionalServerEnv } from '@/lib/db/env'

import { auth } from './index'

import type { AuthSession } from './index'

export class AuthenticationError extends Error {
  readonly status = 401
}

export class AuthorizationError extends Error {
  readonly status = 403
}

export async function getServerSession(requestHeaders?: Headers) {
  return auth.api.getSession({ headers: requestHeaders ?? await headers() })
}

export function isBootstrapAdminUser(userId: string) {
  const bootstrapId = optionalServerEnv('BOOTSTRAP_ADMIN_USER_ID')
  return Boolean(bootstrapId && userId === bootstrapId)
}

export async function requireAdminSession(requestHeaders?: Headers) {
  const session = await requireUserSession(requestHeaders)
  if (session.user.role !== 'admin')
    throw new AuthorizationError('无管理员权限')
  return session
}

/**
 * Restricts control-plane mutations to one stable system administrator.
 *
 * BOOTSTRAP_ADMIN_USER_ID is intentionally temporary during first-time setup,
 * so the bootstrap audit record is the durable source of truth after the
 * environment variable is removed. Legacy installations without that record
 * fall back to their earliest active administrator to avoid a lockout.
 */
export async function requireBootstrapAdminSession(requestHeaders?: Headers) {
  return requireSystemAdminSession(requestHeaders)
}

export async function requireSystemAdminSession(requestHeaders?: Headers) {
  const session = await requireAdminSession(requestHeaders)
  const systemAdminId = await resolveSystemAdminUserId()
  if (!systemAdminId || session.user.id !== systemAdminId)
    throw new AuthorizationError('仅系统主管理员可以执行此操作')
  return session
}

export async function requireUserSession(requestHeaders?: Headers) {
  const current = await getServerSession(requestHeaders)
  const session = current ? await ensureBootstrapAdmin(current) : null
  if (!session || session.user.status !== 'active')
    throw new AuthenticationError('未登录')
  return session
}

export async function resolveSystemAdminUserId() {
  const configuredId = optionalServerEnv('BOOTSTRAP_ADMIN_USER_ID')
  if (configuredId)
    return configuredId

  const result = await getControlPool().query<{ id: string }>(`
    select candidate.id
    from (
      select log.resource_id as id, 0 as priority, min(log.created_at) as selected_at
      from control.audit_logs log
      join auth."user" u on u.id = log.resource_id
      where log.action = 'auth.bootstrap_admin'
        and log.success = true
        and u.role = 'admin'
        and u.status = 'active'
      group by log.resource_id

      union all

      select u.id, 1 as priority, u."createdAt" as selected_at
      from auth."user" u
      where u.role = 'admin' and u.status = 'active'
    ) candidate
    order by candidate.priority, candidate.selected_at, candidate.id
    limit 1
  `)
  return result.rows[0]?.id ?? null
}

async function ensureBootstrapAdmin(session: AuthSession): Promise<AuthSession> {
  const bootstrapId = optionalServerEnv('BOOTSTRAP_ADMIN_USER_ID')
  if (!bootstrapId || !isBootstrapAdminUser(session.user.id) || session.user.role === 'admin')
    return session
  if (!session.user.emailVerified)
    return session

  const promoted = await withControlTransaction(async (client) => {
    const result = await client.query(
      `update auth."user"
       set role = 'admin', "updatedAt" = now()
       where id = $1 and "emailVerified" = true and role = 'user'
       returning id`,
      [bootstrapId],
    )

    if (!result.rowCount)
      return false

    await client.query(
      `insert into control.audit_logs (
         actor_user_id, action, resource_type, resource_id, success, code, metadata
       ) values ($1, 'auth.bootstrap_admin', 'user', $1, true, 'ADMIN_BOOTSTRAPPED', '{}'::jsonb)`,
      [bootstrapId],
    )
    return true
  })

  if (!promoted)
    return session

  await getControlPool().query(
    `delete from auth."session" where "userId" = $1 and token <> $2`,
    [bootstrapId, session.session.token],
  )

  return {
    ...session,
    user: { ...session.user, role: 'admin' },
  }
}

import 'server-only'

import { databaseErrorCode, ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'

import type { Actor } from '@/lib/repositories/catalog'

export interface SecurityServiceState {
  enabled: boolean
  changedAt: string
  changedBy: string | null
  version: number
}

interface SecurityServiceStateRow {
  service_enabled: boolean
  service_state_changed_at: Date
  service_state_changed_by: string | null
  service_state_version: string
}

export class SecurityServiceStateError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function getSecurityServiceState(): Promise<SecurityServiceState> {
  try {
    const result = await queryBusiness<SecurityServiceStateRow>(`
      select service_enabled, service_state_version,
             service_state_changed_at, service_state_changed_by
      from public.ds_ai_security_settings
      where id = true
    `)
    return projectServiceState(requiredStateRow(result.rows[0]))
  }
  catch (error) {
    throw mapServiceStateError(error)
  }
}

export async function setSecurityServiceState(input: {
  enabled: boolean
  expectedVersion: number
}, actor: Actor): Promise<SecurityServiceState> {
  try {
    return await withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const locked = await client.query<SecurityServiceStateRow>(`
        select service_enabled, service_state_version,
               service_state_changed_at, service_state_changed_by
        from public.ds_ai_security_settings
        where id = true
        for update
      `)
      const current = requiredStateRow(locked.rows[0])

      if (current.service_enabled === input.enabled)
        return projectServiceState(current)
      if (Number(current.service_state_version) !== input.expectedVersion) {
        throw new SecurityServiceStateError(
          '评测服务状态已被其他管理员修改，请刷新后重试',
          409,
          'SECURITY_SERVICE_STATE_CONFLICT',
        )
      }

      const updated = await client.query<SecurityServiceStateRow>(`
        update public.ds_ai_security_settings
        set service_enabled = $1,
            service_state_version = service_state_version + 1,
            service_state_changed_at = now(),
            service_state_changed_by = $2::uuid
        where id = true
        returning service_enabled, service_state_version,
                  service_state_changed_at, service_state_changed_by
      `, [input.enabled, actor.id])
      const next = requiredStateRow(updated.rows[0])

      await enqueueSecurityAudit(client, {
        action: input.enabled ? 'security.service.enabled' : 'security.service.disabled',
        actorUserId: actor.id,
        code: input.enabled ? 'SECURITY_SERVICE_ENABLED' : 'SECURITY_SERVICE_DISABLED',
        metadata: {
          nextEnabled: input.enabled,
          nextVersion: Number(next.service_state_version),
          previousEnabled: current.service_enabled,
          previousVersion: Number(current.service_state_version),
        },
        resourceId: 'singleton',
        resourceType: 'security_service',
        success: true,
      })
      return projectServiceState(next)
    })
  }
  catch (error) {
    throw mapServiceStateError(error)
  }
}

function mapServiceStateError(error: unknown): unknown {
  if (error instanceof SecurityServiceStateError)
    return error
  const code = databaseErrorCode(error) ?? databaseErrorCode((error as Error)?.cause)
  if (code === '42P01' || code === '42703') {
    return new SecurityServiceStateError(
      '安全评测数据库尚未完成升级',
      503,
      'SECURITY_SCHEMA_NOT_READY',
    )
  }
  return error
}

function projectServiceState(row: SecurityServiceStateRow): SecurityServiceState {
  return {
    changedAt: row.service_state_changed_at.toISOString(),
    changedBy: row.service_state_changed_by,
    enabled: row.service_enabled,
    version: Number(row.service_state_version),
  }
}

function requiredStateRow(row: SecurityServiceStateRow | undefined) {
  if (!row) {
    throw new SecurityServiceStateError(
      '安全评测设置不存在',
      503,
      'SECURITY_SCHEMA_NOT_READY',
    )
  }
  return row
}

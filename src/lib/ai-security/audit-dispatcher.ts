import 'server-only'

import { withBusinessTransaction } from '@/lib/db/business'
import { getControlPool } from '@/lib/db/control'

interface AuditOutboxRow {
  action: string
  actor_user_id: string | null
  code: string
  id: string
  metadata: Record<string, unknown>
  resource_id: string | null
  resource_type: string
  success: boolean
}

export async function dispatchSecurityAuditOutbox(limit = 50) {
  const batchSize = Math.max(1, Math.min(100, Math.trunc(limit)))
  return withBusinessTransaction(async (businessClient) => {
    const events = await businessClient.query<AuditOutboxRow>(`
      select id, action, actor_user_id, resource_type, resource_id, success, code, metadata
      from public.ds_ai_security_audit_outbox
      where delivered_at is null
      order by created_at, id
      for update skip locked
      limit $1
    `, [batchSize])
    const controlPool = await getControlPool()
    let delivered = 0
    let failed = 0

    for (const event of events.rows) {
      try {
        await controlPool.query(`
          insert into control.audit_logs (
            external_event_id, actor_user_id, action, resource_type,
            resource_id, success, code, metadata
          ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
          on conflict (external_event_id) where external_event_id is not null do nothing
        `, [
          event.id,
          event.actor_user_id,
          event.action,
          event.resource_type,
          event.resource_id,
          event.success,
          event.code,
          JSON.stringify(event.metadata),
        ])
        await businessClient.query(`
          update public.ds_ai_security_audit_outbox
          set delivered_at = now(), delivery_attempts = delivery_attempts + 1,
              last_error_code = null
          where id = $1::uuid and delivered_at is null
        `, [event.id])
        delivered += 1
      }
      catch {
        await businessClient.query(`
          update public.ds_ai_security_audit_outbox
          set delivery_attempts = delivery_attempts + 1,
              last_error_code = 'AUDIT_DELIVERY_FAILED'
          where id = $1::uuid and delivered_at is null
        `, [event.id])
        failed += 1
      }
    }

    return { delivered, failed }
  })
}

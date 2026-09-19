import 'server-only'

import { getControlPool, withControlTransaction } from '@/lib/db/control'

import type { Actor } from '@/lib/repositories/catalog'

export async function getNavigationAiSecuritySettings() {
  const result = await getControlPool().query<{ abuse_protection_enabled: boolean }>(`
    select abuse_protection_enabled
    from control.navigation_ai_security_settings
    where id = true
  `)
  return {
    abuseProtectionEnabled: result.rows[0]?.abuse_protection_enabled ?? true,
  }
}

export async function updateNavigationAiSecuritySettings(enabled: boolean, actor: Actor) {
  await withControlTransaction(async (client) => {
    await client.query(`
      insert into control.navigation_ai_security_settings (
        id, abuse_protection_enabled, updated_at
      ) values (true, $1, now())
      on conflict (id) do update set
        abuse_protection_enabled = excluded.abuse_protection_enabled,
        updated_at = now()
    `, [enabled])
    await client.query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values (
        $1, 'navigation_ai.security.update', 'navigation_ai_security', 'singleton', true,
        'NAVIGATION_AI_SECURITY_UPDATED', jsonb_build_object('abuseProtectionEnabled', $2::boolean)
      )
    `, [actor.id, enabled])
  })

  return getNavigationAiSecuritySettings()
}

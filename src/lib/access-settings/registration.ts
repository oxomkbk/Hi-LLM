import 'server-only'

import { getControlPool } from '@/lib/db/control'

import { emailMatchesAllowlist, normalizeEmailAllowlist } from './email-allowlist'
import {
  missingSiteAccessSettingsColumns,
  REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS,
} from './schema-readiness'

export const REGISTRATION_DISABLED_SENTINEL = 'ACCESS_REGISTRATION_DISABLED_V1'
export const EMAIL_NOT_ALLOWED_SENTINEL = 'ACCESS_EMAIL_NOT_ALLOWED_V1'

export class RegistrationPolicyError extends Error {
  constructor(readonly code: 'ACCESS_POLICY_UNAVAILABLE' | 'EMAIL_NOT_ALLOWED' | 'REGISTRATION_DISABLED') {
    super(code === 'REGISTRATION_DISABLED'
      ? '注册暂未开放'
      : code === 'EMAIL_NOT_ALLOWED'
        ? '该邮箱未被授权访问'
        : '登录策略暂不可用')
  }
}

export async function assertEmailAccessAllowedFresh(email: string, options: { registration: boolean }) {
  try {
    await assertSiteAccessSettingsSchemaReady()
    const result = await getControlPool().query<{
      email_access_mode: string
      email_allowlist: string[]
      registration_enabled: boolean
    }>(`
      select registration_enabled, email_access_mode, email_allowlist
      from control.site_access_settings where id = true
    `)
    const row = result.rows[0]
    if (!row)
      throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
    if (options.registration && !row.registration_enabled)
      throw new RegistrationPolicyError('REGISTRATION_DISABLED')
    if (row.email_access_mode === 'allowlist' && !emailMatchesAllowlist(email, normalizeEmailAllowlist(row.email_allowlist)))
      throw new RegistrationPolicyError('EMAIL_NOT_ALLOWED')
    if (row.email_access_mode !== 'open' && row.email_access_mode !== 'allowlist')
      throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
  }
  catch (error) {
    if (error instanceof RegistrationPolicyError)
      throw error
    console.error('邮箱登录策略 fresh read 失败', error instanceof Error ? { message: error.message, name: error.name } : { name: 'UnknownError' })
    throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
  }
}

export async function assertRegistrationAllowedFresh() {
  try {
    await assertSiteAccessSettingsSchemaReady()
    const result = await getControlPool().query<{ registration_enabled: boolean }>(`
      select registration_enabled from control.site_access_settings where id = true
    `)
    const row = result.rows[0]
    if (!row)
      throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
    if (!row.registration_enabled)
      throw new RegistrationPolicyError('REGISTRATION_DISABLED')
  }
  catch (error) {
    if (error instanceof RegistrationPolicyError)
      throw error
    console.error('注册策略 fresh read 失败', error instanceof Error ? { message: error.message, name: error.name } : { name: 'UnknownError' })
    throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
  }
}

async function assertSiteAccessSettingsSchemaReady() {
  const result = await getControlPool().query<{ column_name: string }>(`
    select column_name
    from information_schema.columns
    where table_schema = 'control'
      and table_name = 'site_access_settings'
      and column_name = any($1::text[])
  `, [REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS])
  const missing = missingSiteAccessSettingsColumns(result.rows.map(row => row.column_name))
  if (!missing.length)
    return

  console.error('访问策略数据库结构尚未完成迁移', { missing })
  throw new RegistrationPolicyError('ACCESS_POLICY_UNAVAILABLE')
}

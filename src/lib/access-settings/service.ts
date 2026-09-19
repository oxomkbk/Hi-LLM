import 'server-only'

import { revalidateTag, unstable_cache } from 'next/cache'

import { getServerSession, requireUserSession } from '@/lib/auth/session'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { assertEmailRegistrationReady, EmailSettingsError } from '@/lib/email/settings'
import {
  normalizeTranslationSettings,
  TranslationSettingsValidationError,
} from '@/lib/translation/languages'

import {
  EmailAllowlistError,
  emailMatchesAllowlist,
  normalizeEmailAccessMode,
  normalizeEmailAllowlist,
} from './email-allowlist'
import { isSubmissionEnabled } from './submission-controls'
import {
  FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS,
} from './types'

import type {
  ContentDetailOpenMode,
  PublicSiteAccessSettings,
  SiteAccessSettings,
  SubmissionAccessMode,
  SubmissionAccessScope,
  UpdateSiteAccessSettingsInput,
  WonderlandComposerMode,
} from './types'
import type { AuthSession } from '@/lib/auth'

const ACCESS_SETTINGS_CACHE_TAG = 'site-access-settings'
const ACCESS_SETTINGS_CACHE_SECONDS = 15

interface SiteAccessSettingsRow {
  config_version: string
  content_detail_open_mode: string
  created_at: Date | string
  email_access_mode: string
  email_allowlist: string[]
  mcp_submission_mode: string
  mcp_submission_enabled: boolean
  mcp_submission_visible: boolean
  prompt_submission_enabled: boolean
  prompt_submission_visible: boolean
  registration_enabled: boolean
  skill_submission_mode: string
  skill_submission_enabled: boolean
  skill_submission_visible: boolean
  translation_default_language: string
  translation_enabled: boolean
  translation_languages: string[]
  updated_at: Date | string
  updated_by: string | null
  website_submission_mode: string
  website_submission_enabled: boolean
  website_submission_visible: boolean
  wonderland_submission_enabled: boolean
  wonderland_submission_visible: boolean
  wonderland_composer_mode: string
  work_submission_enabled: boolean
  work_submission_visible: boolean
}

export class AccessSettingsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'ACCESS_SETTINGS_INVALID',
  ) {
    super(message)
  }
}

const readCachedAccessSettings = unstable_cache(
  () => readAccessSettings(),
  ['site-access-settings-public-v2'],
  { revalidate: ACCESS_SETTINGS_CACHE_SECONDS, tags: [ACCESS_SETTINGS_CACHE_TAG] },
)

export async function getPublicSiteAccessSettings(): Promise<PublicSiteAccessSettings> {
  try {
    const settings = await getSiteAccessSettings()
    return toPublicSettings(settings)
  }
  catch {
    return FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS
  }
}

export async function getSiteAccessSettings(options: { fresh?: boolean } = {}) {
  if (options.fresh)
    return readAccessSettingsSafely()
  try {
    return await readCachedAccessSettings()
  }
  catch (error) {
    console.error('访问策略展示快照读取失败', safeAccessSettingsError(error))
    throw new AccessSettingsError('访问策略暂不可用', 503, 'ACCESS_POLICY_UNAVAILABLE')
  }
}

export function normalizeUpdateInput(input: Record<string, unknown>): UpdateSiteAccessSettingsInput {
  const expectedVersion = normalizeVersion(input.expectedVersion)
  if (typeof input.registrationEnabled !== 'boolean')
    throw new AccessSettingsError('注册设置无效')
  const submissionControls = normalizeSubmissionControls(input)
  try {
    const translation = normalizeTranslationSettings({
      translationDefaultLanguage: input.translationDefaultLanguage,
      translationEnabled: input.translationEnabled,
      translationLanguages: input.translationLanguages,
    })
    return {
      contentDetailOpenMode: normalizeContentDetailOpenMode(input.contentDetailOpenMode),
      emailAccessMode: normalizeEmailAccessMode(input.emailAccessMode),
      emailAllowlist: normalizeEmailAllowlist(input.emailAllowlist),
      expectedVersion,
      mcpSubmissionMode: normalizeSubmissionMode(input.mcpSubmissionMode, 'MCP 投稿'),
      ...submissionControls,
      registrationEnabled: input.registrationEnabled,
      skillSubmissionMode: normalizeSubmissionMode(input.skillSubmissionMode, 'Skills 投稿'),
      ...translation,
      websiteSubmissionMode: normalizeSubmissionMode(input.websiteSubmissionMode, '网站投稿'),
      wonderlandComposerMode: normalizeWonderlandMode(input.wonderlandComposerMode),
    }
  }
  catch (error) {
    if (error instanceof EmailAllowlistError)
      throw new AccessSettingsError(error.message, 422, 'EMAIL_ALLOWLIST_INVALID')
    if (error instanceof TranslationSettingsValidationError)
      throw new AccessSettingsError(error.message, 422, 'TRANSLATION_SETTINGS_INVALID')
    throw error
  }
}

export async function requireRegistrationOpen() {
  const settings = await getSiteAccessSettings({ fresh: true })
  if (!settings.registrationEnabled) {
    throw new AccessSettingsError(
      '注册暂未开放',
      403,
      'REGISTRATION_DISABLED',
    )
  }
}

export async function requireSubmissionAccess(
  scope: SubmissionAccessScope,
  requestHeaders: Headers,
): Promise<AuthSession | null> {
  const settings = await getSiteAccessSettings({ fresh: true })
  if (!isSubmissionEnabled(settings, scope))
    throw new AccessSettingsError('投稿功能暂未开放', 403, 'SUBMISSION_DISABLED')
  const mode = submissionMode(settings, scope)
  if (mode === 'authenticated') {
    try {
      return await requireUserSession(requestHeaders)
    }
    catch {
      throw new AccessSettingsError('请登录后再投稿', 401, 'AUTH_REQUIRED')
    }
  }

  const session = await getServerSession(requestHeaders).catch(() => null)
  return session?.user.status === 'active' ? session : null
}

export async function updateSiteAccessSettings(
  rawInput: Record<string, unknown>,
  actorId: string,
) {
  const input = normalizeUpdateInput(rawInput)
  try {
    const updated = await withControlTransaction(async (client) => {
      const currentResult = await client.query<SiteAccessSettingsRow>(`
        select * from control.site_access_settings where id = true for update
      `)
      const current = currentResult.rows[0]
      if (!current)
        throw new AccessSettingsError('访问策略尚未初始化', 503, 'ACCESS_POLICY_UNAVAILABLE')
      if (current.config_version !== input.expectedVersion)
        throw new AccessSettingsError('设置已被其他管理员更新，请刷新后重试', 409, 'ACCESS_SETTINGS_STALE')

      if (input.registrationEnabled && !current.registration_enabled) {
        try {
          await assertEmailRegistrationReady()
        }
        catch (error) {
          if (error instanceof EmailSettingsError)
            throw new AccessSettingsError(error.message, error.status, error.code)
          throw error
        }
      }

      if (input.emailAccessMode === 'allowlist') {
        const actor = await client.query<{ email: string }>(
          `select email from auth."user" where id = $1`,
          [actorId],
        )
        const actorEmail = actor.rows[0]?.email ?? ''
        if (!emailMatchesAllowlist(actorEmail, input.emailAllowlist)) {
          throw new AccessSettingsError(
            '启用白名单前，请加入当前管理员邮箱或所属域名',
            422,
            'EMAIL_ALLOWLIST_ADMIN_REQUIRED',
          )
        }
      }

      const result = await client.query<SiteAccessSettingsRow>(`
        update control.site_access_settings
        set registration_enabled = $1,
            email_access_mode = $2,
            email_allowlist = $3::text[],
            website_submission_mode = $4,
            website_submission_enabled = $5,
            website_submission_visible = $6,
            skill_submission_mode = $7,
            skill_submission_enabled = $8,
            skill_submission_visible = $9,
            mcp_submission_mode = $10,
            mcp_submission_enabled = $11,
            mcp_submission_visible = $12,
            prompt_submission_enabled = $13,
            prompt_submission_visible = $14,
            wonderland_submission_enabled = $15,
            wonderland_submission_visible = $16,
            wonderland_composer_mode = $17,
            work_submission_enabled = $18,
            work_submission_visible = $19,
            content_detail_open_mode = $20,
            translation_enabled = $21,
            translation_languages = $22::text[],
            translation_default_language = $23,
            config_version = config_version + 1,
            updated_by = $24
        where id = true and config_version = $25::bigint
        returning *
      `, [
        input.registrationEnabled,
        input.emailAccessMode,
        input.emailAllowlist,
        input.websiteSubmissionMode,
        input.websiteSubmissionEnabled,
        input.websiteSubmissionVisible,
        input.skillSubmissionMode,
        input.skillSubmissionEnabled,
        input.skillSubmissionVisible,
        input.mcpSubmissionMode,
        input.mcpSubmissionEnabled,
        input.mcpSubmissionVisible,
        input.promptSubmissionEnabled,
        input.promptSubmissionVisible,
        input.wonderlandSubmissionEnabled,
        input.wonderlandSubmissionVisible,
        input.wonderlandComposerMode,
        input.workSubmissionEnabled,
        input.workSubmissionVisible,
        input.contentDetailOpenMode,
        input.translationEnabled,
        input.translationLanguages,
        input.translationDefaultLanguage,
        actorId,
        input.expectedVersion,
      ])
      const next = result.rows[0]
      if (!next)
        throw new AccessSettingsError('设置已被其他管理员更新，请刷新后重试', 409, 'ACCESS_SETTINGS_STALE')

      await client.query(`
        insert into control.audit_logs (
          actor_user_id, action, resource_type, resource_id, success, code, metadata
        ) values (
          $1, 'site_access_settings.update', 'site_access_settings', 'singleton', true,
          'SITE_ACCESS_SETTINGS_UPDATED', jsonb_build_object(
            'before', $2::jsonb,
            'after', $3::jsonb,
            'previousVersion', $4::text,
            'configVersion', $5::text
          )
        )
      `, [
        actorId,
        JSON.stringify(toAuditSettings(parseRow(current))),
        JSON.stringify(toAuditSettings(parseRow(next))),
        current.config_version,
        next.config_version,
      ])
      return parseRow(next)
    })
    revalidateTag(ACCESS_SETTINGS_CACHE_TAG, 'max')
    return updated
  }
  catch (error) {
    if (!(error instanceof AccessSettingsError)) {
      console.error('访问策略更新失败', safeAccessSettingsError(error))
      await writeFailedAudit(actorId, 'ACCESS_SETTINGS_UPDATE_FAILED').catch(() => undefined)
      throw new AccessSettingsError('访问策略保存失败', 503, 'ACCESS_POLICY_UNAVAILABLE')
    }
    await writeFailedAudit(actorId, error.code).catch(() => undefined)
    throw error
  }
}

function normalizeContentDetailOpenMode(value: unknown): ContentDetailOpenMode {
  if (value !== 'same_tab' && value !== 'new_tab')
    throw new AccessSettingsError('内容详情打开方式无效')
  return value
}

function normalizeSubmissionControls(input: Record<string, unknown>) {
  const fields = [
    ['websiteSubmissionEnabled', '网站投稿功能'],
    ['websiteSubmissionVisible', '网站投稿入口'],
    ['skillSubmissionEnabled', 'Skills 投稿功能'],
    ['skillSubmissionVisible', 'Skills 投稿入口'],
    ['mcpSubmissionEnabled', 'MCP 投稿功能'],
    ['mcpSubmissionVisible', 'MCP 投稿入口'],
    ['promptSubmissionEnabled', 'Prompt 投稿功能'],
    ['promptSubmissionVisible', 'Prompt 投稿入口'],
    ['wonderlandSubmissionEnabled', '妙妙屋投稿功能'],
    ['wonderlandSubmissionVisible', '妙妙屋投稿入口'],
    ['workSubmissionEnabled', '作品投稿功能'],
    ['workSubmissionVisible', '作品投稿入口'],
  ] as const
  for (const [field, label] of fields) {
    if (typeof input[field] !== 'boolean')
      throw new AccessSettingsError(`${label}设置无效`)
  }
  return {
    mcpSubmissionEnabled: input.mcpSubmissionEnabled as boolean,
    mcpSubmissionVisible: input.mcpSubmissionVisible as boolean,
    promptSubmissionEnabled: input.promptSubmissionEnabled as boolean,
    promptSubmissionVisible: input.promptSubmissionVisible as boolean,
    skillSubmissionEnabled: input.skillSubmissionEnabled as boolean,
    skillSubmissionVisible: input.skillSubmissionVisible as boolean,
    websiteSubmissionEnabled: input.websiteSubmissionEnabled as boolean,
    websiteSubmissionVisible: input.websiteSubmissionVisible as boolean,
    wonderlandSubmissionEnabled: input.wonderlandSubmissionEnabled as boolean,
    wonderlandSubmissionVisible: input.wonderlandSubmissionVisible as boolean,
    workSubmissionEnabled: input.workSubmissionEnabled as boolean,
    workSubmissionVisible: input.workSubmissionVisible as boolean,
  }
}

function normalizeSubmissionMode(value: unknown, name: string): SubmissionAccessMode {
  if (value !== 'anonymous' && value !== 'authenticated')
    throw new AccessSettingsError(`${name}访问模式无效`)
  return value
}

function normalizeVersion(value: unknown) {
  const version = typeof value === 'bigint' ? value.toString() : String(value ?? '')
  if (!/^[1-9]\d*$/.test(version))
    throw new AccessSettingsError('设置版本无效')
  return version
}

function normalizeWonderlandMode(value: unknown): WonderlandComposerMode {
  if (value !== 'authenticated' && value !== 'guest_preview')
    throw new AccessSettingsError('Wonderland 编辑模式无效')
  return value
}

function parseRow(row: SiteAccessSettingsRow): SiteAccessSettings {
  let translation
  try {
    translation = normalizeTranslationSettings({
      translationDefaultLanguage: row.translation_default_language,
      translationEnabled: row.translation_enabled,
      translationLanguages: row.translation_languages,
    })
  }
  catch (error) {
    throw new AccessSettingsError(
      error instanceof Error ? error.message : '翻译设置无效',
      503,
      'ACCESS_POLICY_UNAVAILABLE',
    )
  }

  return {
    configVersion: normalizeVersion(row.config_version),
    contentDetailOpenMode: normalizeContentDetailOpenMode(row.content_detail_open_mode),
    createdAt: toIsoString(row.created_at),
    emailAccessMode: normalizeEmailAccessMode(row.email_access_mode),
    emailAllowlist: normalizeEmailAllowlist(row.email_allowlist),
    mcpSubmissionMode: normalizeSubmissionMode(row.mcp_submission_mode, 'MCP 投稿'),
    mcpSubmissionEnabled: row.mcp_submission_enabled === true,
    mcpSubmissionVisible: row.mcp_submission_visible === true,
    promptSubmissionEnabled: row.prompt_submission_enabled === true,
    promptSubmissionVisible: row.prompt_submission_visible === true,
    registrationEnabled: row.registration_enabled === true,
    skillSubmissionMode: normalizeSubmissionMode(row.skill_submission_mode, 'Skills 投稿'),
    skillSubmissionEnabled: row.skill_submission_enabled === true,
    skillSubmissionVisible: row.skill_submission_visible === true,
    ...translation,
    updatedAt: toIsoString(row.updated_at),
    updatedBy: row.updated_by,
    websiteSubmissionMode: normalizeSubmissionMode(row.website_submission_mode, '网站投稿'),
    websiteSubmissionEnabled: row.website_submission_enabled === true,
    websiteSubmissionVisible: row.website_submission_visible === true,
    wonderlandSubmissionEnabled: row.wonderland_submission_enabled === true,
    wonderlandSubmissionVisible: row.wonderland_submission_visible === true,
    wonderlandComposerMode: normalizeWonderlandMode(row.wonderland_composer_mode),
    workSubmissionEnabled: row.work_submission_enabled === true,
    workSubmissionVisible: row.work_submission_visible === true,
  }
}

async function readAccessSettings() {
  const result = await getControlPool().query<SiteAccessSettingsRow>(`
    select * from control.site_access_settings where id = true
  `)
  const row = result.rows[0]
  if (!row)
    throw new AccessSettingsError('访问策略尚未初始化', 503, 'ACCESS_POLICY_UNAVAILABLE')
  return parseRow(row)
}

async function readAccessSettingsSafely() {
  try {
    return await readAccessSettings()
  }
  catch (error) {
    console.error('访问策略 fresh read 失败', safeAccessSettingsError(error))
    throw new AccessSettingsError('访问策略暂不可用', 503, 'ACCESS_POLICY_UNAVAILABLE')
  }
}

function safeAccessSettingsError(error: unknown) {
  return error instanceof Error ? { message: error.message, name: error.name } : { name: 'UnknownError' }
}

function submissionMode(settings: SiteAccessSettings, scope: SubmissionAccessScope) {
  if (scope === 'website')
    return settings.websiteSubmissionMode
  if (scope === 'skill')
    return settings.skillSubmissionMode
  if (scope === 'mcp')
    return settings.mcpSubmissionMode
  if (scope === 'wonderland')
    return settings.wonderlandComposerMode === 'guest_preview' ? 'anonymous' : 'authenticated'
  return 'authenticated'
}

function toAuditSettings(settings: SiteAccessSettings) {
  return {
    contentDetailOpenMode: settings.contentDetailOpenMode,
    emailAccessMode: settings.emailAccessMode,
    emailAllowlistCount: settings.emailAllowlist.length,
    mcpSubmissionMode: settings.mcpSubmissionMode,
    mcpSubmissionEnabled: settings.mcpSubmissionEnabled,
    mcpSubmissionVisible: settings.mcpSubmissionVisible,
    promptSubmissionEnabled: settings.promptSubmissionEnabled,
    promptSubmissionVisible: settings.promptSubmissionVisible,
    registrationEnabled: settings.registrationEnabled,
    skillSubmissionMode: settings.skillSubmissionMode,
    skillSubmissionEnabled: settings.skillSubmissionEnabled,
    skillSubmissionVisible: settings.skillSubmissionVisible,
    translationDefaultLanguage: settings.translationDefaultLanguage,
    translationEnabled: settings.translationEnabled,
    translationLanguages: settings.translationLanguages,
    websiteSubmissionMode: settings.websiteSubmissionMode,
    websiteSubmissionEnabled: settings.websiteSubmissionEnabled,
    websiteSubmissionVisible: settings.websiteSubmissionVisible,
    wonderlandSubmissionEnabled: settings.wonderlandSubmissionEnabled,
    wonderlandSubmissionVisible: settings.wonderlandSubmissionVisible,
    wonderlandComposerMode: settings.wonderlandComposerMode,
    workSubmissionEnabled: settings.workSubmissionEnabled,
    workSubmissionVisible: settings.workSubmissionVisible,
  }
}

function toIsoString(value: Date | string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw new AccessSettingsError('访问策略时间格式无效', 503, 'ACCESS_POLICY_UNAVAILABLE')
  return date.toISOString()
}

function toPublicSettings(settings: SiteAccessSettings): PublicSiteAccessSettings {
  return {
    available: true,
    configVersion: settings.configVersion,
    contentDetailOpenMode: settings.contentDetailOpenMode,
    emailAccessMode: settings.emailAccessMode,
    mcpSubmissionMode: settings.mcpSubmissionMode,
    mcpSubmissionEnabled: settings.mcpSubmissionEnabled,
    mcpSubmissionVisible: settings.mcpSubmissionVisible,
    promptSubmissionEnabled: settings.promptSubmissionEnabled,
    promptSubmissionVisible: settings.promptSubmissionVisible,
    registrationEnabled: settings.registrationEnabled,
    skillSubmissionMode: settings.skillSubmissionMode,
    skillSubmissionEnabled: settings.skillSubmissionEnabled,
    skillSubmissionVisible: settings.skillSubmissionVisible,
    translationDefaultLanguage: settings.translationDefaultLanguage,
    translationEnabled: settings.translationEnabled,
    translationLanguages: settings.translationLanguages,
    websiteSubmissionMode: settings.websiteSubmissionMode,
    websiteSubmissionEnabled: settings.websiteSubmissionEnabled,
    websiteSubmissionVisible: settings.websiteSubmissionVisible,
    wonderlandSubmissionEnabled: settings.wonderlandSubmissionEnabled,
    wonderlandSubmissionVisible: settings.wonderlandSubmissionVisible,
    wonderlandComposerMode: settings.wonderlandComposerMode,
    workSubmissionEnabled: settings.workSubmissionEnabled,
    workSubmissionVisible: settings.workSubmissionVisible,
  }
}

async function writeFailedAudit(actorId: string, code: string) {
  await getControlPool().query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values ($1, 'site_access_settings.update', 'site_access_settings', 'singleton', false, $2, '{}'::jsonb)
  `, [actorId, code])
}

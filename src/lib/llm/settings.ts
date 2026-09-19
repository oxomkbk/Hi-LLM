import 'server-only'

import { decryptConfig, encryptConfig } from '@/lib/db/config-crypto'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { stripControlCharacters } from '@/lib/security'

import { callLlmText, LlmRequestError } from './client'
import { requiresLlmApiKeyReentry } from './settings-security'

import type { EncryptedConfig } from '@/lib/db/config-crypto'
import type { AdminLlmSettings, LlmProtocol } from '@/types'

interface ApiKeySecret {
  apiKey: string
}

interface LlmSettingsRow {
  base_url: string
  encrypted_api_key: EncryptedConfig
  last_check_at: Date | null
  last_check_code: string | null
  last_check_ok: boolean | null
  model: string
  navigation_ai_enabled: boolean
  protocol: LlmProtocol
  updated_at: Date
}

export class LlmSettingsError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'LLM_SETTINGS_INVALID') {
    super(message)
  }
}

export class LlmNotConfiguredError extends LlmSettingsError {
  constructor() {
    super('请先在后台配置大模型', 409, 'LLM_NOT_CONFIGURED')
  }
}

export class NavigationAiDisabledError extends LlmSettingsError {
  constructor() {
    super('前台 AI 检索暂未开放', 404, 'NAVIGATION_AI_DISABLED')
  }
}

export async function getAdminLlmSettings(): Promise<AdminLlmSettings> {
  const row = await readSettingsRow()
  if (!row) {
    return {
      apiKeyConfigured: false,
      apiKeyHint: null,
      baseUrl: 'https://api.openai.com/v1',
      lastCheckAt: null,
      lastCheckCode: null,
      lastCheckOk: null,
      model: '',
      navigationAiEnabled: false,
      protocol: 'openai',
      updatedAt: null,
    }
  }
  const { apiKey } = decryptConfig<ApiKeySecret>(row.encrypted_api_key)
  return {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyHint: apiKey ? `••••${apiKey.slice(-4)}` : null,
    baseUrl: row.base_url,
    lastCheckAt: row.last_check_at?.toISOString() ?? null,
    lastCheckCode: row.last_check_code,
    lastCheckOk: row.last_check_ok,
    model: row.model,
    navigationAiEnabled: row.navigation_ai_enabled,
    protocol: row.protocol,
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function getLlmRuntimeConfig() {
  const row = await readSettingsRow()
  if (!row)
    throw new LlmNotConfiguredError()
  const secret = decryptConfig<ApiKeySecret>(row.encrypted_api_key)
  if (!secret.apiKey)
    throw new LlmNotConfiguredError()
  return {
    apiKey: secret.apiKey,
    baseUrl: row.base_url,
    model: row.model,
    protocol: row.protocol,
  }
}

export async function getNavigationAiRuntimeConfig() {
  const row = await readSettingsRow()
  if (!row?.navigation_ai_enabled)
    throw new NavigationAiDisabledError()
  const secret = decryptConfig<ApiKeySecret>(row.encrypted_api_key)
  if (!secret.apiKey)
    throw new LlmNotConfiguredError()
  return {
    apiKey: secret.apiKey,
    baseUrl: row.base_url,
    model: row.model,
    protocol: row.protocol,
  }
}

export async function isNavigationAiAvailable() {
  const row = await readSettingsRow()
  return Boolean(row?.navigation_ai_enabled && row.model && row.encrypted_api_key)
}

export function normalizeLlmBaseUrl(value: unknown) {
  const input = cleanText(value, 2048, 'Base URL')
  let url: URL
  try {
    url = new URL(input)
  }
  catch {
    throw new LlmSettingsError('Base URL 格式无效')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new LlmSettingsError('Base URL 必须是 HTTP(S) 地址且不能包含账号密码')
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname.toLowerCase())
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !loopback)
    throw new LlmSettingsError('生产环境的远程 Base URL 必须使用 HTTPS')
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export async function saveLlmSettings(input: {
  apiKey?: unknown
  baseUrl?: unknown
  model?: unknown
  navigationAiEnabled?: unknown
  protocol?: unknown
}, actorId: string) {
  const existing = await readSettingsRow()
  const protocol = normalizeProtocol(input.protocol)
  const baseUrl = normalizeLlmBaseUrl(input.baseUrl)
  const model = normalizeModel(input.model)
  const navigationAiEnabled = input.navigationAiEnabled === true
  const suppliedKey = normalizeOptionalApiKey(input.apiKey)
  const existingKey = existing ? decryptConfig<ApiKeySecret>(existing.encrypted_api_key).apiKey : ''
  if (requiresLlmApiKeyReentry({
    existing: existing ? { baseUrl: existing.base_url, protocol: existing.protocol } : null,
    next: { baseUrl, protocol },
    suppliedKey,
  })) {
    throw new LlmSettingsError(
      '更换大模型服务地址或协议时必须重新填写 API Key',
      400,
      'LLM_API_KEY_REQUIRED_ON_ENDPOINT_CHANGE',
    )
  }
  const apiKey = suppliedKey || existingKey
  if (!apiKey)
    throw new LlmSettingsError('请填写 API Key')

  await withControlTransaction(async (client) => {
    await client.query(`
      insert into control.llm_settings (
        id, protocol, base_url, model, encrypted_api_key,
        navigation_ai_enabled, last_check_at, last_check_ok, last_check_code
      ) values (true, $1, $2, $3, $4::jsonb, $5, null, null, null)
      on conflict (id) do update set
        protocol = excluded.protocol,
        base_url = excluded.base_url,
        model = excluded.model,
        encrypted_api_key = excluded.encrypted_api_key,
        navigation_ai_enabled = excluded.navigation_ai_enabled,
        last_check_at = null,
        last_check_ok = null,
        last_check_code = null
    `, [protocol, baseUrl, model, JSON.stringify(encryptConfig<ApiKeySecret>({ apiKey })), navigationAiEnabled])
    await client.query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values (
        $1, 'llm_settings.update', 'llm_settings', 'singleton', true,
        'LLM_SETTINGS_SAVED', jsonb_build_object(
          'protocol', $2::text, 'baseUrl', $3::text, 'model', $4::text,
          'navigationAiEnabled', $5::boolean
        )
      )
    `, [actorId, protocol, baseUrl, model, navigationAiEnabled])
  })
  return getAdminLlmSettings()
}

export async function testSavedLlmSettings(actorId: string) {
  const config = await getLlmRuntimeConfig()
  let ok = false
  let code = 'LLM_CHECK_FAILED'
  try {
    await callLlmText(config, {
      system: '你是连接测试助手。严格按要求输出，不要添加其他内容。',
      user: '只回复四个字：连接成功',
    })
    ok = true
    code = 'LLM_READY'
    return { message: '连接成功' }
  }
  catch (error) {
    code = error instanceof LlmRequestError ? error.code : code
    throw error
  }
  finally {
    await withControlTransaction(async (client) => {
      await client.query(`
        update control.llm_settings
        set last_check_at = now(), last_check_ok = $1, last_check_code = $2
        where id = true
      `, [ok, code])
      await client.query(`
        insert into control.audit_logs (
          actor_user_id, action, resource_type, resource_id, success, code, metadata
        ) values ($1, 'llm_settings.check', 'llm_settings', 'singleton', $2, $3, '{}'::jsonb)
      `, [actorId, ok, code])
    }).catch(() => undefined)
  }
}

function cleanText(value: unknown, maxLength: number, name: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new LlmSettingsError(`请填写${name}`)
  const result = stripControlCharacters(value).trim()
  if (!result || result.length > maxLength)
    throw new LlmSettingsError(`${name}格式无效`)
  return result
}

function normalizeModel(value: unknown) {
  const model = cleanText(value, 200, '模型名称')
  if (/\s/.test(model))
    throw new LlmSettingsError('模型名称不能包含空格')
  return model
}

function normalizeOptionalApiKey(value: unknown) {
  if (value === undefined || value === null || value === '')
    return ''
  return cleanText(value, 4096, 'API Key')
}

function normalizeProtocol(value: unknown): LlmProtocol {
  if (value !== 'openai' && value !== 'anthropic')
    throw new LlmSettingsError('请选择有效的协议')
  return value
}

async function readSettingsRow() {
  const result = await getControlPool().query<LlmSettingsRow>(`
    select protocol, base_url, model, encrypted_api_key,
           navigation_ai_enabled, last_check_at, last_check_ok, last_check_code, updated_at
    from control.llm_settings where id = true
  `)
  return result.rows[0] ?? null
}

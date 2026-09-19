import { normalizeCatalogFileReference } from './catalog-icons'

import type {
  McpAuthType,
  McpContent,
  McpEnvVariable,
  McpInstallation,
  McpSaveParams,
  McpStatus,
} from '@/types'

const DISALLOWED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home', '.lan', '.test', '.invalid']
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/
const RAW_HTML_PATTERN = /<(?:!doctype|!--|\/?[a-z][^>]*)>/i
const SECRET_KEY_PATTERN = /api[-_]?key|token|secret|password|authorization/i
const PLACEHOLDER_PATTERN = /^\$\{[A-Z][A-Z0-9_]{1,63}\}$/

export const MCP_CATEGORIES = ['开发工具', '数据与搜索', '办公协作', '内容创作', '云与运维', '商业服务', '研究知识', '其他'] as const
export const MCP_CLIENTS = ['Claude Desktop', 'Claude Code', 'Codex', 'Cursor', 'VS Code', '通用客户端'] as const
export const MCP_CAPABILITIES = ['Tools', 'Resources', 'Prompts'] as const
export const MCP_TRANSPORTS = ['stdio', 'streamable-http'] as const
export const MCP_AUTH_TYPES = ['none', 'api-key', 'oauth2', 'custom'] as const
export const MCP_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'] as const

export const MCP_SELECT = 'id,slug,registry_name,name,summary,description,category,tags,capabilities,clients,language,protocol_version,installations,source_url,homepage_url,docs_url,publisher_name,publisher_url,version,license,icon,status,featured,verified,sort,publish_requested_at,published_by,published_at,created_at,updated_at'
export const MCP_SUBMISSION_SELECT = 'id,slug,registry_name,name,summary,description,category,tags,capabilities,clients,language,protocol_version,installations,source_url,homepage_url,docs_url,publisher_name,publisher_url,version,license,icon,status,submitter_name,submitter_email,submitted_ip_hash,review_note,reviewer_id,reviewed_at,approved_mcp_id,security_target_id,security_review_status,security_pending_reason,created_at,updated_at'

export function createMcpSlug(value: unknown) {
  const source = typeof value === 'string' ? value.normalize('NFKC').trim() : ''
  const slug = source
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '')

  return slug.length >= 2 ? slug : `mcp-${stableSlugHash(source || 'mcp')}`
}

export async function readMcpJsonBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 64 * 1024)
    throw new Error('提交内容不能超过 64KB')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 64 * 1024)
    throw new Error('提交内容不能超过 64KB')

  let input: unknown
  try {
    input = JSON.parse(text)
  }
  catch {
    throw new Error('JSON 格式无效')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('提交内容格式无效')
  return input as Record<string, unknown>
}

export function sanitizeMcpAdminInput(input: Record<string, unknown>): McpSaveParams {
  const status = input.status === undefined ? 'draft' : input.status
  if (!isMcpStatus(status))
    throw new Error('MCP 状态无效')
  return {
    ...sanitizeMcpInput(input),
    featured: readBoolean(input.featured, false, '精选状态'),
    sort: readSort(input.sort),
    status,
    verified: readBoolean(input.verified, false, '认证状态'),
  }
}

export function sanitizeMcpInput(input: Record<string, unknown>, options: { generateSlug?: boolean } = {}): McpContent {
  const name = readText(input.name, 100, 'MCP 名称', true)
  const summary = readText(input.summary, 240, 'MCP 简介', true)
  const description = readText(input.description, 8000, 'MCP 详情', true)
  const category = readEnum(input.category, MCP_CATEGORIES, 'MCP 分类')
  if (RAW_HTML_PATTERN.test(summary) || RAW_HTML_PATTERN.test(description))
    throw new Error('MCP 内容不能包含原始 HTML')

  return {
    capabilities: readEnumArray(input.capabilities, MCP_CAPABILITIES, '能力', true),
    category,
    clients: readEnumArray(input.clients, MCP_CLIENTS, '兼容客户端', true),
    description,
    docs_url: normalizePublicHttpsUrl(input.docs_url, '文档地址'),
    homepage_url: normalizePublicHttpsUrl(input.homepage_url, '项目主页'),
    icon: normalizeCatalogIcon(input.icon, 'MCP 图标'),
    installations: normalizeInstallations(input.installations),
    language: readText(input.language, 40, '开发语言') || null,
    license: readText(input.license, 50, '开源协议') || null,
    name,
    protocol_version: readEnum(input.protocol_version ?? MCP_PROTOCOL_VERSIONS[0], MCP_PROTOCOL_VERSIONS, '协议版本'),
    publisher_name: readText(input.publisher_name, 80, '发布者名称', true),
    publisher_url: normalizePublicHttpsUrl(input.publisher_url, '发布者主页'),
    registry_name: readText(input.registry_name, 160, 'Registry 名称') || null,
    slug: createMcpSlug(options.generateSlug ? name : readText(input.slug, 80, 'MCP 地址') || name),
    source_url: normalizePublicHttpsUrl(input.source_url, '源代码地址', true)!,
    summary,
    tags: normalizeTags(input.tags),
    version: readText(input.version, 40, 'Server 版本') || null,
  }
}

export function sanitizeMcpReviewNote(value: unknown) {
  return readText(value, 500, '审核备注') || null
}

export function sanitizeMcpSearchTerm(value: string | null) {
  if (!value)
    return ''
  return readText(value, 80, '搜索关键词').replace(/[^\p{L}\p{N}\s+#._/@-]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function sanitizeMcpSubmitter(input: Record<string, unknown>, fallbackName: string) {
  const email = readText(input.submitter_email, 254, '投稿人邮箱')
  if (email && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email))
    throw new Error('投稿人邮箱格式无效')
  return {
    submitter_email: email ? email.toLowerCase() : null,
    submitter_name: readText(input.submitter_name, 80, '投稿人名称') || fallbackName,
  }
}

function isMcpStatus(value: unknown): value is McpStatus {
  return value === 'draft' || value === 'published' || value === 'archived'
}

function normalizeCatalogIcon(value: unknown, field: string) {
  const input = readText(value, 2048, field)
  if (!input)
    return null

  const fileReference = normalizeCatalogFileReference(input)
  if (fileReference)
    return fileReference
  if (input.startsWith('file:') || input.startsWith('/api/files/'))
    throw new Error(`${field}文件引用格式无效`)

  return normalizePublicHttpsUrl(input, field, true)
}

function normalizeConfigTemplate(value: unknown, envVars: McpEnvVariable[]) {
  if (value === undefined || value === null)
    return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('配置模板必须是 JSON 对象')
  const serialized = JSON.stringify(value)
  if (serialized.length > 12000)
    throw new Error('配置模板不能超过 12KB')
  const envNames = new Set(envVars.map(item => item.name))
  validateTemplateValue(value as Record<string, unknown>, envNames)
  return value as Record<string, unknown>
}

function normalizeEnvVars(value: unknown): McpEnvVariable[] {
  if (value === undefined || value === null)
    return []
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('环境变量格式无效')
  const names = new Set<string>()
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('环境变量格式无效')
    const item = raw as Record<string, unknown>
    const name = readText(item.name, 64, '环境变量名', true).toUpperCase()
    if (!ENV_NAME_PATTERN.test(name) || names.has(name))
      throw new Error('环境变量名称无效或重复')
    names.add(name)
    return {
      description: readText(item.description, 160, '环境变量说明'),
      name,
      required: readBoolean(item.required, true, '环境变量必填状态'),
    }
  })
}

function normalizeHeaders(value: unknown, envVars: McpEnvVariable[]) {
  if (value === undefined || value === null)
    return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('请求头格式无效')
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 20)
    throw new Error('请求头最多 20 项')
  const envNames = new Set(envVars.map(item => item.name))
  return Object.fromEntries(entries.map(([key, raw]) => {
    const name = readText(key, 80, '请求头名称', true)
    const headerValue = readText(raw, 200, '请求头值', true)
    const placeholder = headerValue.match(/^\$\{([A-Z][A-Z0-9_]{1,63})\}$/)
    if (SECRET_KEY_PATTERN.test(name) && (!placeholder || !envNames.has(placeholder[1])))
      throw new Error(`${name} 必须引用已声明的环境变量占位符`)
    return [name, headerValue]
  }))
}

function normalizeInstallations(value: unknown): McpInstallation[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('请至少添加一种安装或连接方式')
  if (value.length > 8)
    throw new Error('安装或连接方式最多 8 项')

  const ids = new Set<string>()
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error(`第 ${index + 1} 个连接方式格式无效`)
    const item = raw as Record<string, unknown>
    const transport = readEnum(item.transport, MCP_TRANSPORTS, '传输方式')
    const kind = transport === 'stdio' ? 'package' : 'remote'
    const label = readText(item.label, 60, '连接方式名称', true)
    const id = createMcpSlug(readText(item.id, 80, '连接方式 ID') || label)
    if (ids.has(id))
      throw new Error('连接方式 ID 不能重复')
    ids.add(id)

    const command = readText(item.command, 120, '启动命令') || null
    const packageName = readText(item.package, 200, '包名称') || null
    const remoteUrl = normalizePublicHttpsUrl(item.remote_url, '远程端点')
    if (transport === 'stdio' && (!command || !packageName))
      throw new Error(`${label} 需要填写包名称和启动命令`)
    if (transport === 'streamable-http' && !remoteUrl)
      throw new Error(`${label} 需要填写远程 HTTPS 端点`)

    const envVars = normalizeEnvVars(item.env_vars)
    const headers = normalizeHeaders(item.headers, envVars)
    const configTemplate = normalizeConfigTemplate(item.config_template, envVars)
    return {
      args: normalizeStringArray(item.args, 20, 200, '启动参数'),
      auth_type: readEnum(item.auth_type ?? 'none', MCP_AUTH_TYPES, '认证方式') as McpAuthType,
      command,
      config_template: configTemplate,
      env_vars: envVars,
      headers,
      id,
      kind,
      label,
      package: packageName,
      remote_url: remoteUrl,
      transport,
      version: readText(item.version, 40, '包版本') || null,
    }
  })
}

function normalizePublicHttpsUrl(value: unknown, field: string, required = false) {
  const input = readText(value, 2048, field, required)
  if (!input)
    return null
  let url: URL
  try {
    url = new URL(input)
  }
  catch {
    throw new Error(`${field}格式无效`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error(`${field}必须是公开 HTTPS 地址`)
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const ipLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
  const privateName = hostname === 'localhost' || DISALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  if (!hostname.includes('.') || ipLiteral || privateName)
    throw new Error(`${field}必须使用可公开访问的域名`)
  url.hash = ''
  return url.toString()
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number, field: string) {
  if (!Array.isArray(value))
    throw new Error(`${field}格式无效`)
  const values = [...new Set(value.map(item => readText(item, maxLength, field, true)))]
  if (values.length > maxItems)
    throw new Error(`${field}最多 ${maxItems} 项`)
  return values
}

function normalizeTags(value: unknown) {
  return normalizeStringArray(value ?? [], 10, 24, 'MCP 标签')
}

function readBoolean(value: unknown, fallback: boolean, field: string) {
  if (value === undefined)
    return fallback
  if (typeof value !== 'boolean')
    throw new Error(`${field}格式无效`)
  return value
}

function readEnum<const T extends readonly string[]>(value: unknown, options: T, field: string): T[number] {
  const text = readText(value, 100, field, true)
  if (!(options as readonly string[]).includes(text))
    throw new Error(`${field}无效`)
  return text as T[number]
}

function readEnumArray<const T extends readonly string[]>(value: unknown, options: T, field: string, required = false): T[number][] {
  const values = normalizeStringArray(value, options.length, 50, field)
  if (required && values.length === 0)
    throw new Error(`请至少选择一项${field}`)
  if (values.some(item => !(options as readonly string[]).includes(item)))
    throw new Error(`${field}无效`)
  return values as T[number][]
}

function readSort(value: unknown) {
  if (value === undefined)
    return 1
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 99)
    throw new Error('排序值必须是 1 到 99 的整数')
  return number
}

function readText(value: unknown, maxLength: number, field: string, required = false) {
  if (value === undefined || value === null) {
    if (required)
      throw new Error(`请填写${field}`)
    return ''
  }
  if (typeof value !== 'string')
    throw new Error(`${field}格式无效`)
  const result = Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0
    return code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
  }).join('').trim()
  if (required && !result)
    throw new Error(`请填写${field}`)
  if (Array.from(result).length > maxLength)
    throw new Error(`${field}不能超过 ${maxLength} 个字符`)
  return result
}

function stableSlugHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 8)
}

function validateTemplateValue(value: unknown, envNames: Set<string>, key = '', depth = 0, state = { nodes: 0 }): void {
  state.nodes += 1
  if (depth > 12 || state.nodes > 1_000)
    throw new Error('配置模板层级或节点数量过多')
  if (typeof value === 'string') {
    if (RAW_HTML_PATTERN.test(value))
      throw new Error('配置模板不能包含原始 HTML')
    if (SECRET_KEY_PATTERN.test(key)) {
      const match = value.match(/^\$\{([A-Z][A-Z0-9_]{1,63})\}$/)
      if (!match || !envNames.has(match[1]))
        throw new Error(`${key} 必须使用已声明的环境变量占位符`)
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      const name = value.slice(2, -1)
      if (!envNames.has(name))
        throw new Error(`配置模板引用了未声明的环境变量 ${name}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => validateTemplateValue(item, envNames, key, depth + 1, state))
    return
  }
  if (value && typeof value === 'object')
    Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => validateTemplateValue(child, envNames, childKey, depth + 1, state))
}

import type {
  Mcp,
  McpAuthType,
  McpEnvVariable,
  McpStatus,
  McpSubmission,
  McpTransport,
} from '@/types'

export type McpComposerMode = 'admin-create' | 'admin-edit' | 'submission' | 'submission-review'
export interface McpComposerValue {
  capabilities: string[]
  category: string
  clients: string[]
  description: string
  docs_url: string
  featured: boolean
  homepage_url: string
  icon: string
  installations: McpInstallationDraft[]
  language: string
  license: string
  name: string
  protocol_version: string
  publisher_name: string
  publisher_url: string
  registry_name: string
  slug: string
  sort: number
  source_url: string
  status: McpStatus
  submitter_email: string
  submitter_name: string
  summary: string
  tags: string[]
  verified: boolean
  version: string
}

export interface McpHeaderDraft {
  id: string
  name: string
  value: string
}

export interface McpInstallationDraft {
  args: string[]
  auth_type: McpAuthType
  command: string
  config_template_text: string
  env_vars: McpEnvVariable[]
  headers: McpHeaderDraft[]
  id: string
  kind: 'package' | 'remote'
  label: string
  package: string
  remote_url: string
  transport: McpTransport
  version: string
}

export type McpSubmitIntent = 'approve' | 'reject' | 'save' | 'submit'

export function createEmptyMcpComposerValue(): McpComposerValue {
  return {
    capabilities: ['Tools'],
    category: '开发工具',
    clients: ['通用客户端'],
    description: '',
    docs_url: '',
    featured: false,
    homepage_url: '',
    icon: '',
    installations: [createEmptyMcpInstallation()],
    language: '',
    license: '',
    name: '',
    protocol_version: '2026-07-28',
    publisher_name: '',
    publisher_url: '',
    registry_name: '',
    slug: '',
    sort: 1,
    source_url: '',
    status: 'draft',
    submitter_email: '',
    submitter_name: '',
    summary: '',
    tags: [],
    verified: false,
    version: '',
  }
}

export function createEmptyMcpInstallation(index = 0): McpInstallationDraft {
  return {
    args: [],
    auth_type: 'none',
    command: 'npx',
    config_template_text: '{}',
    env_vars: [],
    headers: [],
    id: index ? `stdio-${index + 1}` : 'stdio',
    kind: 'package',
    label: index ? `本地包 ${index + 1}` : '本地包 / stdio',
    package: '',
    remote_url: '',
    transport: 'stdio',
    version: '',
  }
}

export function installationDraftHasUnsafeSecret(value: McpInstallationDraft) {
  const secretKey = /api[-_]?key|authorization|credential|password|secret|token/i
  try {
    const parsed = parseConfigTemplate(value.config_template_text)
    return containsLiteralSecret(parsed, secretKey)
  }
  catch {
    return true
  }
}

export function mcpComposerPayload(value: McpComposerValue) {
  return {
    capabilities: value.capabilities,
    category: value.category,
    clients: value.clients,
    description: value.description.trim(),
    docs_url: optional(value.docs_url),
    featured: value.featured,
    homepage_url: optional(value.homepage_url),
    icon: optional(value.icon),
    installations: value.installations.map(installation => ({
      args: installation.args,
      auth_type: installation.auth_type,
      command: optional(installation.command),
      config_template: parseConfigTemplate(installation.config_template_text),
      env_vars: installation.env_vars.map(variable => ({
        description: variable.description.trim(),
        name: variable.name.trim().toUpperCase(),
        required: variable.required,
      })),
      headers: Object.fromEntries(installation.headers
        .filter(header => header.name.trim())
        .map(header => [header.name.trim(), header.value.trim()])),
      id: installation.id.trim(),
      kind: installation.transport === 'stdio' ? 'package' : 'remote',
      label: installation.label.trim(),
      package: optional(installation.package),
      remote_url: optional(installation.remote_url),
      transport: installation.transport,
      version: optional(installation.version),
    })),
    language: optional(value.language),
    license: optional(value.license),
    name: value.name.trim(),
    protocol_version: value.protocol_version,
    publisher_name: value.publisher_name.trim(),
    publisher_url: optional(value.publisher_url),
    registry_name: optional(value.registry_name),
    slug: value.slug.trim(),
    sort: value.sort,
    source_url: value.source_url.trim(),
    status: value.status,
    submitter_email: optional(value.submitter_email),
    submitter_name: value.submitter_name.trim(),
    summary: value.summary.trim(),
    tags: value.tags,
    verified: value.verified,
    version: optional(value.version),
  }
}

export function mcpToComposerValue(input: Mcp | McpSubmission): McpComposerValue {
  const published = isPublishedMcp(input) ? input : null
  const submission = published ? null : input as McpSubmission
  return {
    capabilities: input.capabilities,
    category: input.category,
    clients: input.clients,
    description: input.description,
    docs_url: input.docs_url ?? '',
    featured: published?.featured ?? false,
    homepage_url: input.homepage_url ?? '',
    icon: input.icon ?? '',
    installations: input.installations.map((installation, index) => ({
      args: installation.args,
      auth_type: installation.auth_type,
      command: installation.command ?? '',
      config_template_text: JSON.stringify(installation.config_template, null, 2),
      env_vars: installation.env_vars,
      headers: Object.entries(installation.headers).map(([name, headerValue], headerIndex) => ({
        id: `${index}-${headerIndex}-${name}`,
        name,
        value: headerValue,
      })),
      id: installation.id,
      kind: installation.kind,
      label: installation.label,
      package: installation.package ?? '',
      remote_url: installation.remote_url ?? '',
      transport: installation.transport,
      version: installation.version ?? '',
    })),
    language: input.language ?? '',
    license: input.license ?? '',
    name: input.name,
    protocol_version: input.protocol_version,
    publisher_name: input.publisher_name,
    publisher_url: input.publisher_url ?? '',
    registry_name: input.registry_name ?? '',
    slug: input.slug,
    sort: published?.sort ?? 1,
    source_url: input.source_url,
    status: published?.status ?? 'draft',
    submitter_email: submission?.submitter_email ?? '',
    submitter_name: submission?.submitter_name ?? '',
    summary: input.summary,
    tags: input.tags,
    verified: published?.verified ?? false,
    version: input.version ?? '',
  }
}

export function parseConfigTemplate(value: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value || '{}')
  }
  catch {
    throw new Error('高级配置必须是有效的 JSON 对象')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('高级配置的根节点必须是 JSON 对象')
  return parsed as Record<string, unknown>
}

function containsLiteralSecret(value: unknown, secretKey: RegExp, key = ''): boolean {
  if (typeof value === 'string')
    return secretKey.test(key) && !/^\$\{[A-Z][A-Z0-9_]{1,63}\}$/.test(value)
  if (Array.isArray(value))
    return value.some(item => containsLiteralSecret(item, secretKey, key))
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>).some(([childKey, child]) => containsLiteralSecret(child, secretKey, childKey))
  return false
}

function isPublishedMcp(input: Mcp | McpSubmission): input is Mcp {
  return typeof input.featured === 'boolean' && typeof input.sort === 'number'
}

function optional(value: string) {
  const normalized = value.trim()
  return normalized || null
}

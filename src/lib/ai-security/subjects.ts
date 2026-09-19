import { canonicalJson, normalizeSecurityPath } from './canonical-json'
import { createDeclaredFingerprint } from './fingerprints'

export interface DeclaredSecuritySnapshot<T> {
  fingerprint: string
  payload: T
}

interface McpDeclaredInput {
  capabilities: readonly string[]
  description: string
  installations: readonly McpInstallationInput[]
  name: string
  protocolVersion: string
  sourceUrl: string | null
  summary: string
}

interface McpEnvironmentInput {
  name: string
  required: boolean
}

interface McpInstallationInput {
  args: readonly string[]
  authType: string
  command: string | null
  configTemplate: Readonly<Record<string, unknown>>
  envVars: readonly McpEnvironmentInput[]
  headers: Readonly<Record<string, string>>
  kind: string
  packageName: string | null
  remoteUrl: string | null
  transport: string
  version: string | null
}

interface PromptAssetSnapshotInput {
  downloadable: boolean
  entrypoint: boolean
  gallerySort?: number
  path: string
  role: string
  sha256: string
}

interface PromptDeclaredInput {
  assets: readonly PromptAssetSnapshotInput[]
  compatibility: readonly string[]
  contentKind: string
  documents: readonly PromptDocumentSnapshotInput[]
  summary: string
  title: string
}

interface PromptDocumentSnapshotInput {
  content: string
  language: string
  path: string
  role: string
}

interface SkillDeclaredInput {
  description: string
  featured?: boolean
  icon: string | null
  installCommand: string | null
  name: string
  platforms: readonly string[]
  sourceKind: 'external_page' | 'git_repository' | 'platform_content'
  sourceUrl: string | null
  summary: string
  version: string | null
}

const SECRET_KEY_PATTERN = /api[-_]?key|authorization|credential|password|secret|token/i

export function buildMcpDeclaredSnapshot(input: McpDeclaredInput) {
  const installations = input.installations.map(installation => ({
    args: installation.args.map(normalizeText),
    authType: normalizeText(installation.authType),
    command: nullableText(installation.command),
    configTemplate: redactSecretTemplate(installation.configTemplate),
    envVars: installation.envVars.map(variable => ({
      name: normalizeText(variable.name),
      required: variable.required,
    })).sort((left, right) => left.name.localeCompare(right.name)),
    headerNames: normalizeSet(Object.keys(installation.headers)),
    kind: normalizeText(installation.kind),
    packageName: nullableText(installation.packageName),
    remoteUrl: normalizeOptionalUrl(installation.remoteUrl),
    transport: normalizeText(installation.transport),
    version: nullableText(installation.version),
  })).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))

  const payload = {
    capabilities: normalizeSet(input.capabilities),
    description: normalizeText(input.description),
    installations,
    name: normalizeText(input.name),
    protocolVersion: normalizeText(input.protocolVersion),
    sourceUrl: normalizeOptionalUrl(input.sourceUrl),
    summary: normalizeText(input.summary),
  }
  return snapshot('mcp', payload)
}

export function buildPromptDeclaredSnapshot(input: PromptDeclaredInput) {
  const payload = {
    assets: input.assets.map(asset => ({
      downloadable: asset.downloadable,
      entrypoint: asset.entrypoint,
      path: normalizeSecurityPath(asset.path),
      role: normalizeText(asset.role),
      sha256: normalizeSha256(asset.sha256),
    })).sort((left, right) => left.path.localeCompare(right.path)),
    compatibility: normalizeSet(input.compatibility),
    contentKind: normalizeText(input.contentKind),
    documents: input.documents.map((document, position) => ({
      content: document.content.normalize('NFC'),
      language: normalizeText(document.language),
      path: normalizeSecurityPath(document.path),
      position,
      role: normalizeText(document.role),
    })),
    summary: normalizeText(input.summary),
    title: normalizeText(input.title),
  }
  return snapshot('prompt', payload)
}

export function buildSkillDeclaredSnapshot(input: SkillDeclaredInput) {
  const payload = {
    description: normalizeText(input.description),
    icon: nullableText(input.icon),
    installCommand: nullableText(input.installCommand),
    name: normalizeText(input.name),
    platforms: normalizeSet(input.platforms),
    sourceKind: normalizeText(input.sourceKind),
    sourceUrl: normalizeOptionalUrl(input.sourceUrl),
    summary: normalizeText(input.summary),
    version: nullableText(input.version),
  }
  return snapshot('skill', payload)
}

function normalizeOptionalUrl(value: string | null) {
  return value ? normalizeRequiredUrl(value) : null
}

function normalizeRequiredUrl(value: string) {
  const url = new URL(normalizeText(value))
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString()
}

function normalizeSet(values: readonly string[]) {
  return [...new Set(values.map(normalizeText))].sort()
}

function normalizeSha256(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw new TypeError('Invalid asset SHA-256')
  return value
}

function normalizeText(value: string) {
  return value.normalize('NFC').trim()
}

function nullableText(value: string | null) {
  return value === null ? null : normalizeText(value)
}

function redactSecretTemplate(value: unknown, key = ''): unknown {
  if (SECRET_KEY_PATTERN.test(key))
    return '[REDACTED_SECRET]'
  if (Array.isArray(value))
    return value.map(item => redactSecretTemplate(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entryKey, entryValue]) => [entryKey.normalize('NFC'), redactSecretTemplate(entryValue, entryKey)]))
  }
  if (typeof value === 'string')
    return value.normalize('NFC')
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value
  throw new TypeError('Unsupported MCP configuration template value')
}

function snapshot<T>(subjectType: 'mcp' | 'prompt' | 'skill', payload: T): DeclaredSecuritySnapshot<T> {
  return {
    fingerprint: createDeclaredFingerprint(subjectType, payload),
    payload,
  }
}

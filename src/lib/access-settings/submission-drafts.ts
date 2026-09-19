export type SubmissionDraftScope = 'mcp' | 'skill' | 'website'

const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 24 * 60 * 60 * 1_000
const MAX_DRAFT_BYTES = 128 * 1024
const KEY_PREFIX = 'hillm-nav:submission-draft:v1:'
const LEGACY_KEY_PREFIX = 'better-nav:submission-draft:v1:'
const FORBIDDEN_VALUE_PATTERN = /^(?:blob:|data:)/i
const FORBIDDEN_KEY_PATTERN = /file|blob|upload|csrf|token|company|form_started_at/i

const TOP_LEVEL_KEYS: Record<SubmissionDraftScope, ReadonlySet<string>> = {
  website: new Set(['categoryIds', 'name', 'url', 'desc', 'vpn']),
  skill: new Set([
    'name',
    'summary',
    'description',
    'category',
    'platforms',
    'tags',
    'source_kind',
    'source_url',
    'homepage_url',
    'install_command',
    'author_name',
    'author_url',
    'version',
    'license',
    'icon',
    'submitter_name',
    'submitter_email',
  ]),
  mcp: new Set([
    'name',
    'summary',
    'description',
    'category',
    'capabilities',
    'clients',
    'tags',
    'language',
    'protocol_version',
    'installations',
    'source_url',
    'homepage_url',
    'docs_url',
    'publisher_name',
    'publisher_url',
    'registry_name',
    'version',
    'license',
    'icon',
    'submitter_name',
    'submitter_email',
  ]),
}

interface StoredDraft {
  data: Record<string, unknown>
  expiresAt: number
  savedAt: number
  scope: SubmissionDraftScope
  version: number
}

export function clearSubmissionDraft(scope: SubmissionDraftScope) {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(`${KEY_PREFIX}${scope}`)
    window.localStorage.removeItem(`${LEGACY_KEY_PREFIX}${scope}`)
  }
}

export function loadSubmissionDraft(scope: SubmissionDraftScope) {
  if (typeof window === 'undefined')
    return null
  const key = `${KEY_PREFIX}${scope}`
  const legacyKey = `${LEGACY_KEY_PREFIX}${scope}`
  const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey)
  if (!raw)
    return null
  if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES) {
    window.localStorage.removeItem(key)
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    if (
      parsed.version !== DRAFT_VERSION
      || parsed.scope !== scope
      || typeof parsed.expiresAt !== 'number'
      || parsed.expiresAt <= Date.now()
      || !parsed.data
      || typeof parsed.data !== 'object'
      || Array.isArray(parsed.data)
    ) {
      window.localStorage.removeItem(key)
      return null
    }
    const sanitized = sanitizeTopLevel(scope, parsed.data)
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, raw)
      window.localStorage.removeItem(legacyKey)
    }
    return sanitized
  }
  catch {
    window.localStorage.removeItem(key)
    return null
  }
}

export function saveSubmissionDraft(scope: SubmissionDraftScope, input: Record<string, unknown>) {
  if (typeof window === 'undefined')
    return false
  const data = sanitizeTopLevel(scope, input)
  const now = Date.now()
  const draft: StoredDraft = {
    data,
    expiresAt: now + DRAFT_TTL_MS,
    savedAt: now,
    scope,
    version: DRAFT_VERSION,
  }
  const serialized = JSON.stringify(draft)
  if (new TextEncoder().encode(serialized).byteLength > MAX_DRAFT_BYTES)
    return false
  window.localStorage.setItem(`${KEY_PREFIX}${scope}`, serialized)
  return true
}

function sanitizeTopLevel(scope: SubmissionDraftScope, input: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const key of TOP_LEVEL_KEYS[scope]) {
    if (!(key in input) || FORBIDDEN_KEY_PATTERN.test(key))
      continue
    const value = sanitizeValue(input[key], 0, scope === 'mcp' && key === 'installations')
    if (value !== undefined)
      result[key] = value
  }
  return result
}

function sanitizeValue(value: unknown, depth: number, installationTree = false): unknown {
  if (depth > 6 || value === null)
    return value === null ? null : undefined
  if (typeof File !== 'undefined' && value instanceof File)
    return undefined
  if (typeof Blob !== 'undefined' && value instanceof Blob)
    return undefined
  if (typeof value === 'string') {
    if (value.length > 16_000 || FORBIDDEN_VALUE_PATTERN.test(value.trim()))
      return undefined
    return value
  }
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return value
  if (Array.isArray(value)) {
    if (value.length > (installationTree ? 8 : 64))
      return undefined
    const items = value.map(item => sanitizeValue(item, depth + 1, installationTree))
    return items.includes(undefined) ? undefined : items
  }
  if (typeof value !== 'object')
    return undefined

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 64)
    return undefined
  const result: Record<string, unknown> = {}
  for (const [key, item] of entries) {
    if (!/^[\w.${}-]{1,80}$/.test(key) || FORBIDDEN_KEY_PATTERN.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key))
      return undefined
    const sanitized = sanitizeValue(item, depth + 1, installationTree)
    if (sanitized === undefined)
      return undefined
    result[key] = sanitized
  }
  return result
}

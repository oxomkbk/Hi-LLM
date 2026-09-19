import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|command.*output|content|credential|evidence|password|prompt|secret|token/i
const MAX_AUDIT_DEPTH = 6
const MAX_AUDIT_ENTRIES = 100
const MAX_AUDIT_STRING_LENGTH = 1000

export interface SecurityAuditEvent {
  action: string
  actorUserId: string | null
  code: string
  id?: string
  metadata?: Readonly<Record<string, unknown>>
  resourceId: string | null
  resourceType: string
  success: boolean
}

export async function enqueueSecurityAudit(client: PoolClient, event: SecurityAuditEvent) {
  const id = event.id ?? randomUUID()
  await client.query(`
    insert into public.ds_ai_security_audit_outbox (
      id, action, actor_user_id, resource_type, resource_id, success, code, metadata
    ) values ($1, $2, $3::uuid, $4, $5, $6, $7, $8::jsonb)
  `, [
    id,
    boundedText(event.action, 120),
    event.actorUserId,
    boundedText(event.resourceType, 100),
    event.resourceId ? boundedText(event.resourceId, 180) : null,
    event.success,
    boundedText(event.code, 100),
    JSON.stringify(sanitizeAuditMetadata(event.metadata ?? {})),
  ])
  return id
}

export function sanitizeAuditMetadata(input: Readonly<Record<string, unknown>>) {
  return sanitizeAuditValue(input, 0) as Record<string, unknown>
}

function boundedText(value: string, maximum: number) {
  const normalized = value.normalize('NFC').trim()
  if (!normalized || normalized.length > maximum)
    throw new TypeError('Invalid security audit field')
  return normalized
}

function sanitizeAuditValue(value: unknown, depth: number): unknown {
  if (depth > MAX_AUDIT_DEPTH)
    return '[TRUNCATED]'
  if (value === null || typeof value === 'boolean')
    return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : '[INVALID_NUMBER]'
  if (typeof value === 'string')
    return value.normalize('NFC').slice(0, MAX_AUDIT_STRING_LENGTH)
  if (Array.isArray(value))
    return value.slice(0, MAX_AUDIT_ENTRIES).map(item => sanitizeAuditValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).slice(0, MAX_AUDIT_ENTRIES)
    return Object.fromEntries(entries.map(([key, entryValue]) => [
      key.normalize('NFC').slice(0, 100),
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeAuditValue(entryValue, depth + 1),
    ]))
  }
  return '[UNSUPPORTED]'
}

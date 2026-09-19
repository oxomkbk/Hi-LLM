import { sha256Canonical } from './canonical-json'

import type { SecurityMode, SecuritySubjectType } from './domain'

export interface LlmRuntimeIdentity {
  basePath: string
  fingerprint: string
  host: string
  model: string
  parameters: Readonly<Record<string, unknown>>
  port: string
  protocol: 'anthropic' | 'openai'
  scheme: 'http' | 'https'
}

export interface LlmRuntimeIdentityInput {
  apiKey?: string
  baseUrl: string
  model: string
  parameters?: Readonly<Record<string, unknown>>
  protocol: 'anthropic' | 'openai'
  updatedAt?: Date | string
}

export interface SecurityModeSettings {
  mcpMode: SecurityMode
  promptMode: SecurityMode
  skillMode: SecurityMode
}

export function createLlmRuntimeIdentity(input: LlmRuntimeIdentityInput): LlmRuntimeIdentity {
  const endpoint = normalizeIdentityEndpoint(input.baseUrl)
  const identity = {
    basePath: endpoint.pathname,
    host: endpoint.hostname,
    model: normalizeIdentityText(input.model, 'model'),
    parameters: input.parameters ?? {},
    port: endpoint.port || defaultPort(endpoint.protocol),
    protocol: input.protocol,
    scheme: endpoint.protocol.slice(0, -1) as 'http' | 'https',
  }
  return {
    ...identity,
    fingerprint: sha256Canonical({ schema: 'llm-runtime-identity-v1', ...identity }),
  }
}

export function securityModeForSubject(settings: SecurityModeSettings, subjectType: SecuritySubjectType) {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return settings.skillMode
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return settings.mcpMode
  return settings.promptMode
}

function defaultPort(protocol: string) {
  return protocol === 'https:' ? '443' : '80'
}

function normalizeIdentityEndpoint(value: string) {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  }
  catch {
    throw new TypeError('Invalid LLM Base URL')
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw new TypeError('LLM Base URL must be an HTTP(S) endpoint without credentials')
  endpoint.search = ''
  endpoint.hash = ''
  endpoint.pathname = endpoint.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  return endpoint
}

function normalizeIdentityText(value: string, field: string) {
  const normalized = value.normalize('NFC').trim()
  if (!normalized || normalized.length > 200)
    throw new TypeError(`Invalid LLM ${field}`)
  return normalized
}

import { describe, expect, it } from 'vitest'

import {
  createEmptyMcpComposerValue,
  installationDraftHasUnsafeSecret,
  mcpComposerPayload,
  mcpToComposerValue,
} from './types'

import type { Mcp } from '@/types'

const ENV_REFERENCE = '$' + '{API_TOKEN}'

describe('mCP composer model', () => {
  it('round-trips arbitrary nested config without rebuilding known keys', () => {
    const source = createMcpFixture()
    const draft = mcpToComposerValue(source)
    draft.name = 'Edited title only'
    const payload = mcpComposerPayload(draft)

    expect(payload.name).toBe('Edited title only')
    expect(payload.installations[0].config_template).toEqual(source.installations[0].config_template)
    expect(payload.installations[0].config_template).toMatchObject({
      enabled: true,
      nested: { array: [null, 1, false, { token: ENV_REFERENCE }] },
      unknown_extension: { mode: 'strict' },
    })
  })

  it('preserves installation payloads after clone and reorder operations', () => {
    const value = mcpToComposerValue(createMcpFixture())
    const clone = JSON.parse(JSON.stringify(value.installations[0])) as typeof value.installations[number]
    clone.id = 'copy'
    clone.label = 'Copy'
    value.installations = [clone, value.installations[0]]

    const payload = mcpComposerPayload(value)
    expect(payload.installations.map(item => item.id)).toEqual(['copy', 'stdio'])
    expect(payload.installations[0].config_template).toEqual(payload.installations[1].config_template)
  })

  it('pauses browser persistence for invalid JSON or literal secrets', () => {
    const value = createEmptyMcpComposerValue()
    value.installations[0].config_template_text = '{'
    expect(installationDraftHasUnsafeSecret(value.installations[0])).toBe(true)

    value.installations[0].config_template_text = JSON.stringify({ apiKey: 'literal-secret' })
    expect(installationDraftHasUnsafeSecret(value.installations[0])).toBe(true)

    value.installations[0].config_template_text = JSON.stringify({ apiKey: ENV_REFERENCE })
    expect(installationDraftHasUnsafeSecret(value.installations[0])).toBe(false)
  })

  it('preserves an administrator featured choice in the next save', () => {
    const source = createMcpFixture()
    source.featured = true

    const draft = mcpToComposerValue(source)
    const payload = mcpComposerPayload({ ...draft, featured: true })

    expect(draft.featured).toBe(true)
    expect(payload.featured).toBe(true)
  })
})

function createMcpFixture(): Mcp {
  return {
    capabilities: ['Tools'],
    category: '开发工具',
    clients: ['通用客户端'],
    created_at: '2026-08-22T00:00:00.000Z',
    description: '# MCP\n\nDescription',
    docs_url: null,
    featured: false,
    homepage_url: null,
    icon: null,
    id: '00000000-0000-4000-8000-000000000001',
    installations: [{
      args: ['-y'],
      auth_type: 'api-key',
      command: 'npx',
      config_template: {
        enabled: true,
        nested: { array: [null, 1, false, { token: ENV_REFERENCE }] },
        unknown_extension: { mode: 'strict' },
      },
      env_vars: [{ description: 'Access token', name: 'API_TOKEN', required: true }],
      headers: { Authorization: ENV_REFERENCE },
      id: 'stdio',
      kind: 'package',
      label: 'Local',
      package: '@example/mcp',
      remote_url: null,
      transport: 'stdio',
      version: '1.0.0',
    }],
    language: 'TypeScript',
    license: 'MIT',
    name: 'Example MCP',
    protocol_version: '2026-07-28',
    published_at: null,
    published_by: null,
    publisher_name: 'Example',
    publisher_url: null,
    registry_name: 'io.example/mcp',
    slug: 'example-mcp',
    sort: 1,
    source_url: 'https://github.com/example/mcp',
    status: 'draft',
    summary: 'Example summary',
    tags: ['example'],
    updated_at: '2026-08-22T00:00:00.000Z',
    verified: false,
    version: '1.0.0',
  }
}

import { describe, expect, it } from 'vitest'

import { createMcpSlug, sanitizeMcpAdminInput, sanitizeMcpInput } from './mcps'

describe('mCP normalization', () => {
  it('creates a stable fallback slug for Chinese names', () => {
    expect(createMcpSlug('网页搜索服务')).toBe(createMcpSlug('网页搜索服务'))
    expect(createMcpSlug('网页搜索服务')).toMatch(/^mcp-[a-z0-9]{7,8}$/)
  })

  it('rejects overly deep advanced configuration', () => {
    let config: Record<string, unknown> = {}
    for (let index = 0; index < 14; index += 1)
      config = { nested: config }

    expect(() => sanitizeMcpInput({
      capabilities: ['Tools'],
      category: '开发工具',
      clients: ['通用客户端'],
      description: 'Description',
      installations: [{
        args: [],
        auth_type: 'none',
        command: 'npx',
        config_template: config,
        env_vars: [],
        headers: {},
        id: 'stdio',
        label: 'Local',
        package: '@example/mcp',
        transport: 'stdio',
      }],
      name: 'Example MCP',
      protocol_version: '2026-07-28',
      publisher_name: 'Example',
      slug: 'example-mcp',
      source_url: 'https://github.com/example/mcp',
      summary: 'Summary',
      tags: [],
    })).toThrow('配置模板层级或节点数量过多')
  })

  it('normalizes uploaded icons and rejects malformed file references', () => {
    const fileId = '123e4567-e89b-42d3-a456-426614174000'

    expect(sanitizeMcpInput(mcpInput({ icon: `file:${fileId}` })).icon).toBe(`file:${fileId}`)
    expect(sanitizeMcpInput(mcpInput({ icon: `/api/files/${fileId}` })).icon).toBe(`file:${fileId}`)
    expect(sanitizeMcpInput(mcpInput({ icon: 'https://cdn.example.com/mcp.png#preview' })).icon).toBe('https://cdn.example.com/mcp.png')
    expect(() => sanitizeMcpInput(mcpInput({ icon: '/api/files/not-a-file-id' }))).toThrowError(/MCP 图标文件引用格式无效/)
  })

  it('preserves an explicit featured choice from an administrator', () => {
    const result = sanitizeMcpAdminInput(mcpInput({
      featured: true,
      sort: 99,
      status: 'draft',
      verified: false,
    }))

    expect(result.featured).toBe(true)
  })
})

function mcpInput(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: ['Tools'],
    category: '开发工具',
    clients: ['通用客户端'],
    description: 'Description',
    installations: [{
      args: [],
      auth_type: 'none',
      command: 'npx',
      config_template: {},
      env_vars: [],
      headers: {},
      id: 'stdio',
      label: 'Local',
      package: '@example/mcp',
      transport: 'stdio',
    }],
    name: 'Example MCP',
    protocol_version: '2026-07-28',
    publisher_name: 'Example',
    slug: 'example-mcp',
    source_url: 'https://github.com/example/mcp',
    summary: 'Summary',
    tags: [],
    ...overrides,
  }
}

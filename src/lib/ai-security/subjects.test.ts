import { describe, expect, it } from 'vitest'

import {
  buildMcpDeclaredSnapshot,
  buildPromptDeclaredSnapshot,
  buildSkillDeclaredSnapshot,
} from './subjects'

describe('security subject snapshots', () => {
  it('ignores Skill ranking fields but invalidates on security content changes', () => {
    const baseline = buildSkillDeclaredSnapshot({
      description: 'Read files safely.',
      featured: false,
      icon: null,
      installCommand: 'npx demo',
      name: 'Demo',
      platforms: ['codex'],
      sourceKind: 'git_repository',
      sourceUrl: 'https://github.com/acme/demo',
      summary: 'A demo skill',
      version: '1.0.0',
    })
    const rankingOnly = buildSkillDeclaredSnapshot({
      description: 'Read files safely.',
      featured: true,
      icon: null,
      installCommand: 'npx demo',
      name: 'Demo',
      platforms: ['codex'],
      sourceKind: 'git_repository',
      sourceUrl: 'https://github.com/acme/demo',
      summary: 'A demo skill',
      version: '1.0.0',
    })
    const changed = buildSkillDeclaredSnapshot({
      description: 'Read files and execute commands.',
      featured: false,
      icon: null,
      installCommand: 'npx demo',
      name: 'Demo',
      platforms: ['codex'],
      sourceKind: 'git_repository',
      sourceUrl: 'https://github.com/acme/demo',
      summary: 'A demo skill',
      version: '1.0.0',
    })
    const changedSourceCoverage = buildSkillDeclaredSnapshot({
      description: 'Read files safely.',
      featured: false,
      icon: null,
      installCommand: 'npx demo',
      name: 'Demo',
      platforms: ['codex'],
      sourceKind: 'external_page',
      sourceUrl: 'https://catalog.example/skills/demo',
      summary: 'A demo skill',
      version: '1.0.0',
    })

    expect(baseline.fingerprint).toBe(rankingOnly.fingerprint)
    expect(baseline.fingerprint).not.toBe(changed.fingerprint)
    expect(baseline.fingerprint).not.toBe(changedSourceCoverage.fingerprint)
  })

  it('does not fingerprint MCP header secrets but does fingerprint header names', () => {
    const baseline = buildMcpDeclaredSnapshot(mcpInput({ headers: { Authorization: 'first-secret' } }))
    const rotated = buildMcpDeclaredSnapshot(mcpInput({ headers: { Authorization: 'rotated-secret' } }))
    const renamed = buildMcpDeclaredSnapshot(mcpInput({ headers: { 'X-Api-Key': 'first-secret' } }))

    expect(baseline.fingerprint).toBe(rotated.fingerprint)
    expect(baseline.fingerprint).not.toBe(renamed.fingerprint)
  })

  it('fingerprints Prompt document order and asset security fields, not gallery order', () => {
    const input = promptInput()
    const baseline = buildPromptDeclaredSnapshot(input)
    const galleryReordered = buildPromptDeclaredSnapshot({
      ...input,
      assets: input.assets.map(asset => ({ ...asset, gallerySort: asset.gallerySort + 10 })),
    })
    const documentReordered = buildPromptDeclaredSnapshot({
      ...input,
      documents: [...input.documents].reverse(),
    })

    expect(baseline.fingerprint).toBe(galleryReordered.fingerprint)
    expect(baseline.fingerprint).not.toBe(documentReordered.fingerprint)
  })
})

function mcpInput(overrides: { headers: Record<string, string> }) {
  return {
    capabilities: ['filesystem'],
    description: 'A local MCP server',
    installations: [{
      args: ['server.js'],
      authType: 'api-key',
      command: 'node',
      configTemplate: { endpoint: 'https://api.example.com', token: 'secret-placeholder' },
      envVars: [{ name: 'API_KEY', required: true }],
      headers: overrides.headers,
      kind: 'package',
      packageName: '@acme/mcp',
      remoteUrl: null,
      transport: 'stdio',
      version: '1.0.0',
    }],
    name: 'Demo MCP',
    protocolVersion: '2025-06-18',
    sourceUrl: null,
    summary: 'Demo',
  }
}

function promptInput() {
  return {
    assets: [{
      downloadable: false,
      entrypoint: false,
      gallerySort: 1,
      path: 'assets/cover.png',
      role: 'cover',
      sha256: 'a'.repeat(64),
    }],
    compatibility: ['Next.js'],
    contentKind: 'web_ui',
    documents: [
      { content: 'Build a dashboard', language: 'markdown', path: 'prompt.md', role: 'prompt' },
      { content: 'Use restrained colors', language: 'markdown', path: 'style.md', role: 'style' },
    ],
    summary: 'Dashboard prompt',
    title: 'Dashboard',
  }
}

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { isPriorityRepositoryMaterialPath, selectPriorityRepositoryMaterial } from './priority-material'

import type { AcquiredSourceFile } from './manifest'

describe('priority repository material selection', () => {
  it('selects the matching Skill directory before unrelated repository files', () => {
    const result = selectPriorityRepositoryMaterial({
      files: [
        file('README.md', '# Repository overview'),
        file('skills/other/SKILL.md', '# Other skill'),
        file('skills/other/README.md', '# Other instructions'),
        file('skills/agentic-workflows/SKILL.md', '# Agentic workflows'),
        file('skills/agentic-workflows/README.md', '# Workflow usage'),
        file('skills/agentic-workflows/package.json', '{"name":"agentic-workflows"}'),
        file('src/large.ts', 'const ignored = true'),
      ],
      subjectKind: 'skill',
      subjectSlug: 'agentic-workflows',
    })

    expect(result.scopeDirectory).toBe('skills/agentic-workflows')
    expect(result.files.map(item => item.path)).toEqual([
      'skills/agentic-workflows/SKILL.md',
      'skills/agentic-workflows/README.md',
      'README.md',
      'skills/agentic-workflows/package.json',
    ])
    expect(result.files.some(item => item.path.includes('other'))).toBe(false)
    expect(result.skippedFileCount).toBe(3)
  })

  it('uses the sole SKILL.md when the source URL points at a single-skill repository', () => {
    const result = selectPriorityRepositoryMaterial({
      files: [
        file('packages/reviewer/SKILL.md', '# Review'),
        file('README.md', '# Repository'),
        file('packages/reviewer/INSTALL.md', '# Install'),
      ],
      subjectKind: 'skill',
      subjectSlug: 'different-public-slug',
    })

    expect(result.scopeDirectory).toBe('packages/reviewer')
    expect(result.files.map(item => item.path)).toEqual([
      'packages/reviewer/SKILL.md',
      'README.md',
      'packages/reviewer/INSTALL.md',
    ])
  })

  it('matches a repository folder when the public slug includes a publisher prefix', () => {
    const result = selectPriorityRepositoryMaterial({
      files: [
        file('skills/context-engineering/SKILL.md', '# Context engineering'),
        file('skills/performance-optimization/SKILL.md', '# Performance'),
        file('README.md', '# Repository'),
      ],
      subjectKind: 'skill',
      subjectSlug: 'addyosmani-context-engineering',
    })

    expect(result.scopeDirectory).toBe('skills/context-engineering')
    expect(result.files.map(item => item.path)).toEqual([
      'skills/context-engineering/SKILL.md',
      'README.md',
    ])
  })

  it('prioritizes README and manifests for MCP without requiring SKILL.md', () => {
    const result = selectPriorityRepositoryMaterial({
      files: [
        file('src/index.ts', 'export {}'),
        file('docs/SECURITY.md', '# Security'),
        file('README.md', '# MCP usage'),
        file('package.json', '{"name":"example-mcp"}'),
        file('LICENSE', 'MIT'),
      ],
      subjectKind: 'mcp',
    })

    expect(result.files.map(item => item.path)).toEqual([
      'README.md',
      'package.json',
      'docs/SECURITY.md',
    ])
  })

  it('enforces file and text budgets without including executable source files', () => {
    const result = selectPriorityRepositoryMaterial({
      files: [
        file('SKILL.md', 'a'.repeat(90)),
        file('README.md', 'b'.repeat(90)),
        file('SECURITY.md', 'c'.repeat(90)),
        file('package.json', 'd'.repeat(90)),
        file('run.sh', 'echo ignored'),
      ],
      maxFiles: 3,
      maxTextBytes: 200,
      subjectKind: 'skill',
      subjectSlug: 'example',
    })

    expect(result.files).toHaveLength(3)
    expect(result.inspectedBytes).toBe(200)
    expect(result.files.map(item => item.bytes.byteLength)).toEqual([90, 90, 20])
    expect(result.truncatedPaths).toEqual(['SECURITY.md'])
    expect(result.files.some(item => item.path === 'run.sh')).toBe(false)
  })

  it('prefilters archive entries to documentation and manifests only', () => {
    expect(isPriorityRepositoryMaterialPath('skills/example/SKILL.md', 'skill', 'example')).toBe(true)
    expect(isPriorityRepositoryMaterialPath('skills/example/README.md', 'skill', 'example')).toBe(true)
    expect(isPriorityRepositoryMaterialPath('skills/other/README.md', 'skill', 'example')).toBe(false)
    expect(isPriorityRepositoryMaterialPath('src/index.ts', 'skill', 'example')).toBe(false)
    expect(isPriorityRepositoryMaterialPath('docs/SECURITY.md', 'mcp')).toBe(true)
    expect(isPriorityRepositoryMaterialPath('packages/deep/docs/README.md', 'mcp')).toBe(false)
  })
})

function file(path: string, content: string): AcquiredSourceFile {
  const bytes = Buffer.from(content, 'utf8')
  return {
    bytes,
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

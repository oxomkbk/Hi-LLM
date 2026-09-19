import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createStoredZip, inspectSourceArchive, prepareSkillSourceArchive } from './archive'

describe('bounded Skill source archives', () => {
  it('inspects a generic repository without requiring a Skill manifest', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('# Repository'), path: 'repo-root/README.md' },
      { bytes: Buffer.from('{"name":"demo"}'), path: 'repo-root/package.json' },
    ])

    const manifest = await inspectSourceArchive({ archive: source })

    expect(manifest.paths).toEqual(new Set(['README.md', 'package.json']))
    expect(manifest.fileCount).toBe(2)
    expect(manifest.totalBytes).toBe(27)
  })

  it('inspects and strips a selected generic repository subdirectory', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('ignored'), path: 'repo-root/README.md' },
      { bytes: Buffer.from('server'), path: 'repo-root/packages/mcp/index.ts' },
    ])

    const manifest = await inspectSourceArchive({ archive: source, subdirectory: 'packages/mcp' })

    expect(manifest.paths).toEqual(new Set(['index.ts']))
    expect(manifest.fileCount).toBe(1)
  })

  it('strips the provider root and selected subdirectory, then creates a stable manifest', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('# ignored'), path: 'repo-root/README.md' },
      { bytes: Buffer.from('# Safe skill'), path: 'repo-root/skills/review/SKILL.md' },
      { bytes: Buffer.from('Review instructions'), path: 'repo-root/skills/review/README.md' },
    ])
    const prepared = await prepareSkillSourceArchive({ archive: source, subdirectory: 'skills/review' })

    expect(prepared.manifest.paths).toEqual(new Set(['README.md', 'SKILL.md']))
    expect(prepared.manifest.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true)
    const roundTrip = await prepareSkillSourceArchive({ archive: prepared.archive })
    expect(roundTrip.manifest.paths).toEqual(new Set(['README.md', 'SKILL.md']))
  })

  it('accepts a multi-Skill repository when the requested slug has its own SKILL.md', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('# Repository'), path: 'repo-root/README.md' },
      { bytes: Buffer.from('# Other'), path: 'repo-root/skills/other/SKILL.md' },
      { bytes: Buffer.from('# Target'), path: 'repo-root/skills/agentic-workflows/SKILL.md' },
    ])

    const prepared = await prepareSkillSourceArchive({
      archive: source,
      subjectSlug: 'agentic-workflows',
    })

    expect(prepared.manifest.paths).toEqual(new Set([
      'README.md',
      'skills/agentic-workflows/SKILL.md',
      'skills/other/SKILL.md',
    ]))
  })

  it('ignores unsafe entry types outside the selected Skill directory', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('elsewhere'), mode: 0o120777, path: 'repo-root/unrelated-link' },
      { bytes: Buffer.from('# Safe skill'), path: 'repo-root/skills/review/SKILL.md' },
    ])

    const prepared = await prepareSkillSourceArchive({ archive: source, subdirectory: 'skills/review' })

    expect(prepared.manifest.paths).toEqual(new Set(['SKILL.md']))
  })

  it('safely ignores links inside the selected Skill directory', async () => {
    const source = createStoredZip([
      { bytes: Buffer.from('# Unsafe skill'), path: 'repo-root/skills/review/SKILL.md' },
      { bytes: Buffer.from('target'), mode: 0o120777, path: 'repo-root/skills/review/link' },
    ])

    const prepared = await prepareSkillSourceArchive({ archive: source, subdirectory: 'skills/review' })

    expect(prepared.manifest.paths).toEqual(new Set(['SKILL.md']))
  })

  it('rejects traversal and missing root SKILL.md', async () => {
    expect(() => createStoredZip([{ bytes: Buffer.from('x'), path: '../escape' }])).toThrow()
    const archive = createStoredZip([{ bytes: Buffer.from('# readme'), path: 'repo/README.md' }])
    await expect(prepareSkillSourceArchive({ archive })).rejects.toThrowError(/SECURITY_SOURCE_INVALID/)
  })

  it('enforces file and materialized byte limits before forwarding the archive', async () => {
    const archive = createStoredZip([
      { bytes: Buffer.from('# Skill'), path: 'repo/SKILL.md' },
      { bytes: Buffer.alloc(64), path: 'repo/README.md' },
    ])
    await expect(prepareSkillSourceArchive({
      archive,
      limits: { maxFileBytes: 32 },
    })).rejects.toThrowError(/SOURCE_LIMIT_EXCEEDED/)
  })
})

import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { createStoredZip } from './acquisition/archive'
import { parseProviderUrl } from './acquisition/provider-url'
import { AiSecurityError } from './errors'
import {
  checkSecuritySubjectSource,
  SecuritySourceCheckServiceError,
} from './source-check'

import type { SecuritySourceCheckDependencies } from './source-check'
import type { SecuritySubjectSnapshot } from './subject-repository'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/business', () => ({ getBusinessPool: vi.fn() }))
vi.mock('./settings-repository', () => ({ getSecuritySettings: vi.fn() }))
vi.mock('./subject-repository', () => ({ loadSecuritySubjectSnapshot: vi.fn() }))

const REVISION = 'abcdef0123456789abcdef0123456789abcdef01'
const NOW = new Date('2026-09-01T00:00:00.000Z')

describe('managed Git source checks', () => {
  it('checks a Skill repository without creating an assessment result', async () => {
    const archive = createStoredZip([
      { bytes: Buffer.from('# Skill'), path: 'repo-root/SKILL.md' },
      { bytes: Buffer.from('docs'), path: 'repo-root/README.md' },
    ])
    const dependencies = sourceDependencies(skillSnapshot(), archive)

    const result = await checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, dependencies)

    expect(result).toEqual({
      archiveBytes: archive.byteLength,
      canonicalUrl: 'https://github.com/acme/skills',
      checkedAt: '2026-09-01T00:00:00.000Z',
      fileCount: 2,
      projectPath: 'acme/skills',
      provider: 'github',
      ref: 'HEAD',
      sourceRevision: REVISION,
      subdirectory: null,
      totalBytes: 11,
    })
    expect(result).not.toHaveProperty('assessmentId')
    expect(result).not.toHaveProperty('securityReportState')
    expect(dependencies.resolveRevision).toHaveBeenCalledOnce()
    expect(dependencies.downloadArchive).toHaveBeenCalledOnce()
  })

  it('checks a safe MCP repository without requiring SKILL.md', async () => {
    const archive = createStoredZip([
      { bytes: Buffer.from('{"name":"mcp"}'), path: 'repo-root/package.json' },
      { bytes: Buffer.from('implementation'), path: 'repo-root/src/server.ts' },
    ])

    const result = await checkSecuritySubjectSource({
      subjectId: mcpSnapshot().id,
      subjectType: 'mcp',
    }, sourceDependencies(mcpSnapshot(), archive))

    expect(result.fileCount).toBe(1)
    expect(result.totalBytes).toBe(14)
    expect(result.projectPath).toBe('acme/mcp-server')
  })

  it.each([
    {
      expectedCode: 'SOURCE_CHECK_NOT_APPLICABLE',
      expectedStatus: 422,
      snapshot: skillSnapshot({ sourceKind: 'platform_content', sourceUrl: null }),
      title: 'a Skill without a Git source',
    },
    {
      expectedCode: 'SOURCE_CHECK_NOT_APPLICABLE',
      expectedStatus: 422,
      snapshot: mcpSnapshot({ sourceUrl: null }),
      title: 'an MCP without a source URL',
    },
  ])('rejects $title with a stable contract', async ({ expectedCode, expectedStatus, snapshot }) => {
    const error = await captureError(checkSecuritySubjectSource({
      subjectId: snapshot.id,
      subjectType: snapshot.subjectType as 'mcp' | 'skill',
    }, sourceDependencies(snapshot, createStoredZip([{ bytes: Buffer.from('x'), path: 'repo/file' }]))))

    expect(error).toBeInstanceOf(SecuritySourceCheckServiceError)
    expect(error).toMatchObject({ code: expectedCode, status: expectedStatus })
  })

  it('maps a missing managed subject without assessment terminology', async () => {
    const dependencies = sourceDependencies(skillSnapshot(), new Uint8Array())
    dependencies.loadContext.mockRejectedValue(new AiSecurityError(
      'SECURITY_ASSESSMENT_NOT_FOUND',
      'Security subject does not exist',
    ))

    const error = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, dependencies))

    expect(error).toMatchObject({ code: 'SOURCE_CHECK_SUBJECT_NOT_FOUND', status: 404 })
    expect(error.message).toMatch(/资源不存在/)
  })

  it('rejects a provider that is not in the configured source allowlist', async () => {
    const dependencies = sourceDependencies(skillSnapshot(), new Uint8Array())
    dependencies.loadContext.mockResolvedValue(sourceContext(skillSnapshot(), ['gitlab.com']))

    const error = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, dependencies))

    expect(error).toMatchObject({ code: 'SOURCE_CHECK_URL_INVALID', status: 422 })
    expect(dependencies.resolveRevision).not.toHaveBeenCalled()
  })

  it('distinguishes revision resolution from fixed-revision archive download failures', async () => {
    const revisionFailure = sourceDependencies(skillSnapshot(), new Uint8Array())
    revisionFailure.resolveRevision.mockRejectedValue(new Error('provider ref unavailable'))
    const revisionError = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, revisionFailure))
    expect(revisionError).toMatchObject({ code: 'SOURCE_CHECK_REVISION_UNAVAILABLE', status: 409 })
    expect(revisionFailure.downloadArchive).not.toHaveBeenCalled()

    const downloadFailure = sourceDependencies(skillSnapshot(), new Uint8Array())
    downloadFailure.downloadArchive.mockRejectedValue(new Error('archive unavailable'))
    const downloadError = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, downloadFailure))
    expect(downloadError).toMatchObject({ code: 'SOURCE_CHECK_DOWNLOAD_FAILED', status: 502 })
  })

  it('distinguishes invalid source structure from configured size limits', async () => {
    const invalidArchive = sourceDependencies(skillSnapshot(), Buffer.from('not a zip'))
    const structureError = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, invalidArchive))
    expect(structureError).toMatchObject({ code: 'SOURCE_CHECK_STRUCTURE_INVALID', status: 422 })

    const largeFile = createStoredZip([
      { bytes: Buffer.from('# Skill'), path: 'repo/SKILL.md' },
      { bytes: Buffer.alloc(64), path: 'repo/README.md' },
    ])
    const limited = sourceDependencies(skillSnapshot(), largeFile)
    limited.loadContext.mockResolvedValue({
      ...sourceContext(skillSnapshot()),
      limits: { ...sourceContext(skillSnapshot()).limits, maxFileBytes: 32 },
    })
    const limitError = await captureError(checkSecuritySubjectSource({
      subjectId: skillSnapshot().id,
      subjectType: 'skill',
    }, limited))
    expect(limitError).toMatchObject({ code: 'SOURCE_CHECK_LIMIT_EXCEEDED', status: 413 })
  })
})

async function captureError(promise: Promise<unknown>) {
  try {
    await promise
    throw new Error('Expected source check to reject')
  }
  catch (error) {
    return error as Error & { code?: string, status?: number }
  }
}

function mcpSnapshot(overrides: Record<string, unknown> = {}): SecuritySubjectSnapshot {
  return {
    declaredFingerprint: 'mcp-fingerprint',
    id: '00000000-0000-4000-8000-000000000002',
    name: 'MCP Server',
    payload: {
      installations: [],
      sourceUrl: 'https://github.com/acme/mcp-server',
      ...overrides,
    },
    slug: 'mcp-server',
    subjectType: 'mcp',
  }
}

function skillSnapshot(overrides: Record<string, unknown> = {}): SecuritySubjectSnapshot {
  return {
    declaredFingerprint: 'skill-fingerprint',
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Skill',
    payload: {
      sourceKind: 'git_repository',
      sourceUrl: 'https://github.com/acme/skills',
      ...overrides,
    },
    slug: 'skill',
    subjectType: 'skill',
  }
}

function sourceContext(snapshot: SecuritySubjectSnapshot, allowedSourceHosts = ['github.com', 'gitlab.com']) {
  return {
    allowedSourceHosts,
    limits: {
      maxArchiveBytes: 1024 * 1024,
      maxDepth: 16,
      maxFileBytes: 1024,
      maxFiles: 100,
      maxMaterializedBytes: 1024 * 1024,
    },
    snapshot,
  }
}

function sourceDependencies(snapshot: SecuritySubjectSnapshot, archive: Uint8Array) {
  const providerUrl = parseProviderUrl(String((snapshot.payload as Record<string, unknown>).sourceUrl ?? 'https://github.com/acme/fallback'))
  return {
    downloadArchive: vi.fn<SecuritySourceCheckDependencies['downloadArchive']>().mockResolvedValue(archive),
    loadContext: vi.fn<SecuritySourceCheckDependencies['loadContext']>().mockResolvedValue(sourceContext(snapshot)),
    now: vi.fn(() => NOW),
    resolveRevision: vi.fn<SecuritySourceCheckDependencies['resolveRevision']>().mockResolvedValue({
      providerUrl,
      sourceRevision: REVISION,
    }),
  }
}

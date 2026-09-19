import { describe, expect, it, vi } from 'vitest'

import { GitSourceConnectionError } from './git-provider'
import { SecurityGitSourceCache } from './source-cache'

const SOURCE = 'https://github.com/acme/repo'
const SHA = 'a'.repeat(40)

function resolved(revision = SHA) {
  return {
    providerUrl: {
      canonicalUrl: SOURCE,
      host: 'github.com' as const,
      projectPath: 'acme/repo',
      provider: 'github' as const,
      ref: 'HEAD',
      repository: 'repo',
      subdirectory: null,
    },
    sourceRevision: revision,
  }
}

describe('security Git source cache', () => {
  it('shares revision and archive promises for the same repository', async () => {
    const resolveRevision = vi.fn().mockResolvedValue(resolved())
    const downloadArchive = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    const cache = new SecurityGitSourceCache({ downloadArchive, resolveRevision })

    const [first, second] = await Promise.all([
      cache.acquire({ maxArchiveBytes: 10, sourceUrl: SOURCE }),
      cache.acquire({ maxArchiveBytes: 10, sourceUrl: SOURCE }),
    ])

    expect(resolveRevision).toHaveBeenCalledTimes(1)
    expect(downloadArchive).toHaveBeenCalledTimes(1)
    expect(first.archive).toBe(second.archive)
    expect(cache.snapshot()).toMatchObject({ archiveHits: 1, revisionHits: 1 })
  })

  it('evicts completed archives before reserving and never exceeds the shared budget', async () => {
    const resolveRevision = vi.fn()
      .mockResolvedValueOnce(resolved('a'.repeat(40)))
      .mockResolvedValueOnce(resolved('b'.repeat(40)))
    const downloadArchive = vi.fn()
      .mockResolvedValueOnce(new Uint8Array(6))
      .mockResolvedValueOnce(new Uint8Array(6))
    const cache = new SecurityGitSourceCache({
      byteBudget: 10,
      downloadArchive,
      maxArchiveBytes: 6,
      resolveRevision,
    })

    await cache.acquire({ maxArchiveBytes: 6, sourceUrl: `${SOURCE}/tree/main` })
    await cache.acquire({ maxArchiveBytes: 6, sourceUrl: `${SOURCE}/tree/dev` })

    expect(cache.snapshot()).toMatchObject({
      completedArchiveBytes: 6,
      peakAccountedBytes: 6,
      reservedBytes: 0,
    })
  })

  it('releases reservations after a failed download', async () => {
    const cache = new SecurityGitSourceCache({
      byteBudget: 8,
      downloadArchive: vi.fn().mockRejectedValue(new Error('offline')),
      maxArchiveBytes: 8,
      resolveRevision: vi.fn().mockResolvedValue(resolved()),
    })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE })).rejects.toThrow('offline')
    expect(cache.snapshot()).toMatchObject({
      completedArchiveBytes: 0,
      reservedBytes: 0,
    })
  })

  it('opens a host circuit only after repeated connection failures', async () => {
    const resolveRevision = vi.fn().mockRejectedValue(new GitSourceConnectionError({
      cause: new Error('connect timeout'),
      host: 'github.com',
      phase: 'revision',
      reason: 'timeout',
    }))
    const cache = new SecurityGitSourceCache({ resolveRevision })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE }))
      .rejects
      .toMatchObject({ code: 'SECURITY_SOURCE_FETCH_FAILED' })
    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: 'https://github.com/other/repo' }))
      .rejects
      .toMatchObject({ code: 'SECURITY_SOURCE_FETCH_FAILED' })
    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: 'https://github.com/third/repo' }))
      .rejects
      .toMatchObject({ code: 'SECURITY_SOURCE_FETCH_FAILED', reason: 'circuit_open' })

    expect(resolveRevision).toHaveBeenCalledTimes(4)
    expect(cache.snapshot().unavailableHosts).toEqual(['github.com'])
  })

  it('falls back to the provider API when smart HTTP cannot resolve a revision', async () => {
    const resolveRevision = vi.fn()
      .mockRejectedValueOnce(new GitSourceConnectionError({
        cause: new Error('smart HTTP timeout'),
        host: 'github.com',
        phase: 'revision',
        reason: 'timeout',
      }))
      .mockResolvedValueOnce(resolved())
    const downloadArchive = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    const cache = new SecurityGitSourceCache({ downloadArchive, resolveRevision })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE }))
      .resolves
      .toMatchObject({ sourceRevision: SHA })

    expect(resolveRevision).toHaveBeenNthCalledWith(1, expect.objectContaining({ strategy: 'smart_http' }))
    expect(resolveRevision).toHaveBeenNthCalledWith(2, expect.objectContaining({ strategy: 'provider_rest' }))
    expect(cache.snapshot().unavailableHosts).toEqual([])
  })

  it('resolves fixed SHAs locally even when the provider revision circuit is open', async () => {
    const resolveRevision = vi.fn().mockRejectedValue(new GitSourceConnectionError({
      cause: new Error('connect timeout'),
      host: 'github.com',
      phase: 'revision',
      reason: 'timeout',
    }))
    const downloadArchive = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    const cache = new SecurityGitSourceCache({ downloadArchive, resolveRevision })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE })).rejects.toBeInstanceOf(GitSourceConnectionError)
    await expect(cache.acquire({
      maxArchiveBytes: 8,
      sourceUrl: `https://github.com/other/repo/tree/${SHA}`,
    })).resolves.toMatchObject({ sourceRevision: SHA })

    expect(resolveRevision).toHaveBeenCalledTimes(2)
    expect(downloadArchive).toHaveBeenCalledTimes(1)
  })

  it('opens the actual archive-host circuit after repeated failures and skips later attempts', async () => {
    const resolveRevision = vi.fn().mockResolvedValue(resolved())
    const downloadArchive = vi.fn().mockRejectedValue(new GitSourceConnectionError({
      cause: new Error('socket unavailable'),
      host: 'codeload.github.com',
      phase: 'archive',
      reason: 'connect',
    }))
    const cache = new SecurityGitSourceCache({ downloadArchive, resolveRevision })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE }))
      .rejects
      .toMatchObject({ host: 'codeload.github.com', phase: 'archive', reason: 'connect' })
    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE }))
      .rejects
      .toMatchObject({ host: 'codeload.github.com', phase: 'archive', reason: 'connect' })
    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE }))
      .rejects
      .toMatchObject({ host: 'codeload.github.com', phase: 'archive', reason: 'circuit_open' })

    expect(downloadArchive).toHaveBeenCalledTimes(2)
    expect(cache.snapshot().unavailableHosts).toEqual(['codeload.github.com'])
  })

  it('does not open a circuit for protocol failures or cancellation', async () => {
    const protocolFailure = new Error('invalid pkt-line')
    const resolveRevision = vi.fn()
      .mockRejectedValueOnce(protocolFailure)
      .mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    const cache = new SecurityGitSourceCache({ resolveRevision })

    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE })).rejects.toBe(protocolFailure)
    await expect(cache.acquire({ maxArchiveBytes: 8, sourceUrl: SOURCE })).rejects.toMatchObject({ name: 'AbortError' })

    expect(resolveRevision).toHaveBeenCalledTimes(2)
    expect(cache.snapshot().unavailableHosts).toEqual([])
  })

  it('expires revision entries and enforces the local per-download cap', async () => {
    let now = 1_000
    const resolveRevision = vi.fn().mockResolvedValue(resolved())
    const downloadArchive = vi.fn().mockResolvedValue(new Uint8Array(9))
    const cache = new SecurityGitSourceCache({
      byteBudget: 20,
      downloadArchive,
      maxArchiveBytes: 8,
      now: () => now,
      resolveRevision,
      revisionTtlMs: 50,
    })

    await expect(cache.acquire({ maxArchiveBytes: 100, sourceUrl: SOURCE }))
      .rejects
      .toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' })
    now += 51
    downloadArchive.mockResolvedValue(new Uint8Array(2))
    await cache.acquire({ maxArchiveBytes: 100, sourceUrl: SOURCE })

    expect(resolveRevision).toHaveBeenCalledTimes(2)
  })
})

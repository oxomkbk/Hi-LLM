import { AiSecurityError } from '../errors'
import {
  buildGitSourceArchiveUrl,
  downloadGitSourceArchive,
  GitSourceConnectionError,
  isGitSourceConnectionError,
  normalizeFixedGitRevision,
  resolveGitSourceRevision,
} from './git-provider'
import { parseProviderUrl } from './provider-url'

import type { GitSourceDownload, ResolvedGitSource } from './git-provider'

const DEFAULT_BYTE_BUDGET = 192 * 1024 * 1024
const DEFAULT_LOCAL_ARCHIVE_CAP = 100 * 1024 * 1024

interface ArchiveEntry {
  bytes: Uint8Array
  lastUsed: number
}

interface CacheOptions {
  byteBudget?: number
  downloadArchive?: typeof downloadGitSourceArchive
  maxArchiveBytes?: number
  maxArchiveEntries?: number
  maxRevisionEntries?: number
  now?: () => number
  resolveRevision?: typeof resolveGitSourceRevision
  revisionTtlMs?: number
}

interface RevisionEntry {
  expiresAt: number
  lastUsed: number
  promise: Promise<ResolvedGitSource>
}

export class SecurityGitSourceCache {
  private readonly archives = new Map<string, ArchiveEntry>()
  private archiveHits = 0
  private completedArchiveBytes = 0
  private downloadTail = Promise.resolve()
  private readonly inflightArchives = new Map<string, Promise<Uint8Array>>()
  private readonly hostConnectionFailures = new Map<string, number>()
  private peakAccountedBytes = 0
  private reservedBytes = 0
  private readonly revisions = new Map<string, RevisionEntry>()
  private revisionHits = 0
  private readonly unavailableHosts = new Set<string>()

  private readonly byteBudget: number
  private readonly downloadArchive: typeof downloadGitSourceArchive
  private readonly maxArchiveBytes: number
  private readonly maxArchiveEntries: number
  private readonly maxRevisionEntries: number
  private readonly now: () => number
  private readonly resolveRevision: typeof resolveGitSourceRevision
  private readonly revisionTtlMs: number

  constructor(options: CacheOptions = {}) {
    this.byteBudget = positiveInteger(options.byteBudget ?? DEFAULT_BYTE_BUDGET, 'byte budget')
    this.downloadArchive = options.downloadArchive ?? downloadGitSourceArchive
    this.maxArchiveBytes = positiveInteger(options.maxArchiveBytes ?? DEFAULT_LOCAL_ARCHIVE_CAP, 'archive cap')
    this.maxArchiveEntries = positiveInteger(options.maxArchiveEntries ?? 4, 'archive entries')
    this.maxRevisionEntries = positiveInteger(options.maxRevisionEntries ?? 1024, 'revision entries')
    this.now = options.now ?? Date.now
    this.resolveRevision = options.resolveRevision ?? resolveGitSourceRevision
    this.revisionTtlMs = positiveInteger(options.revisionTtlMs ?? 30 * 60_000, 'revision TTL')
  }

  async acquire(input: {
    maxArchiveBytes: number
    signal?: AbortSignal
    sourceUrl: string
  }): Promise<GitSourceDownload> {
    throwIfAborted(input.signal)
    const resolved = await this.getRevision(input.sourceUrl, input.signal)
    const archive = await this.getArchive(resolved, input.maxArchiveBytes, input.signal)
    return { archive, ...resolved }
  }

  clear() {
    this.archives.clear()
    this.revisions.clear()
    this.unavailableHosts.clear()
    this.hostConnectionFailures.clear()
    this.completedArchiveBytes = 0
  }

  snapshot() {
    return {
      archiveEntries: this.archives.size,
      archiveHits: this.archiveHits,
      completedArchiveBytes: this.completedArchiveBytes,
      peakAccountedBytes: this.peakAccountedBytes,
      reservedBytes: this.reservedBytes,
      revisionEntries: this.revisions.size,
      revisionHits: this.revisionHits,
      unavailableHosts: [...this.unavailableHosts].sort(),
    }
  }

  private async getArchive(
    resolved: ResolvedGitSource,
    requestedMaximum: number,
    signal?: AbortSignal,
  ) {
    const archiveHost = buildGitSourceArchiveUrl(
      resolved.providerUrl,
      resolved.sourceRevision,
    ).hostname
    if (this.unavailableHosts.has(archiveHost)) {
      throw new GitSourceConnectionError({
        host: archiveHost,
        phase: 'archive',
        reason: 'circuit_open',
      })
    }
    const key = `${resolved.providerUrl.provider}:${resolved.providerUrl.projectPath}:${resolved.sourceRevision}`
    const cached = this.archives.get(key)
    if (cached) {
      cached.lastUsed = this.now()
      this.archiveHits += 1
      return cached.bytes
    }
    const inflight = this.inflightArchives.get(key)
    if (inflight) {
      this.archiveHits += 1
      return inflight
    }
    const maximum = Math.min(
      positiveInteger(requestedMaximum, 'requested archive maximum'),
      this.maxArchiveBytes,
    )
    const promise = this.withDownloadSlot(async () => {
      throwIfAborted(signal)
      this.reserve(maximum)
      let reservationHeld = true
      try {
        const bytes = await this.downloadArchive({
          maxArchiveBytes: maximum,
          providerUrl: resolved.providerUrl,
          signal,
          sourceRevision: resolved.sourceRevision,
        })
        this.recordHostSuccess(archiveHost)
        if (bytes.byteLength > maximum)
          throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '源码归档超出本地批量评测上限')
        this.reservedBytes -= maximum
        reservationHeld = false
        this.evictArchiveEntriesFor(bytes.byteLength)
        while (this.archives.size >= this.maxArchiveEntries)
          this.evictOldestArchive()
        this.archives.set(key, { bytes, lastUsed: this.now() })
        this.completedArchiveBytes += bytes.byteLength
        this.updatePeak()
        return bytes
      }
      catch (error) {
        if (reservationHeld)
          this.reservedBytes -= maximum
        if (isGitSourceConnectionError(error))
          this.recordHostFailure(error.host)
        throw error
      }
    }, signal)
    this.inflightArchives.set(key, promise)
    try {
      return await promise
    }
    finally {
      this.inflightArchives.delete(key)
    }
  }

  private async getRevision(sourceUrl: string, signal?: AbortSignal) {
    const provider = parseProviderUrl(sourceUrl)
    const fixedRevision = normalizeFixedGitRevision(provider.ref)
    if (fixedRevision) {
      return {
        providerUrl: provider,
        sourceRevision: fixedRevision,
      }
    }
    if (this.unavailableHosts.has(provider.host)) {
      throw new GitSourceConnectionError({
        host: provider.host,
        phase: 'revision',
        reason: 'circuit_open',
      })
    }
    const key = `${provider.provider}:${provider.projectPath}:${provider.ref}`
    const now = this.now()
    const cached = this.revisions.get(key)
    if (cached && cached.expiresAt > now) {
      cached.lastUsed = now
      this.revisionHits += 1
      return cached.promise
    }
    if (cached)
      this.revisions.delete(key)
    const promise = this.resolveRevisionWithFallback(provider.canonicalUrl, signal).then((resolved) => {
      this.recordHostSuccess(provider.host)
      return resolved
    })
    this.revisions.set(key, {
      expiresAt: now + this.revisionTtlMs,
      lastUsed: now,
      promise,
    })
    this.evictRevisionEntries()
    try {
      return await promise
    }
    catch (error) {
      if (this.revisions.get(key)?.promise === promise)
        this.revisions.delete(key)
      if (isGitSourceConnectionError(error))
        this.recordHostFailure(error.host)
      throw error
    }
  }

  private async resolveRevisionWithFallback(sourceUrl: string, signal?: AbortSignal) {
    try {
      return await this.resolveRevision({
        signal,
        sourceUrl,
        strategy: 'smart_http',
      })
    }
    catch (error) {
      if (!isGitSourceConnectionError(error))
        throw error
      throwIfAborted(signal)
      return this.resolveRevision({
        signal,
        sourceUrl,
        strategy: 'provider_rest',
      })
    }
  }

  private recordHostFailure(host: string) {
    const failures = (this.hostConnectionFailures.get(host) ?? 0) + 1
    this.hostConnectionFailures.set(host, failures)
    if (failures >= 2)
      this.unavailableHosts.add(host)
  }

  private recordHostSuccess(host: string) {
    this.hostConnectionFailures.delete(host)
    this.unavailableHosts.delete(host)
  }

  private reserve(bytes: number) {
    if (bytes > this.byteBudget)
      throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '单个源码归档超过共享缓存预算')
    this.evictArchiveEntriesFor(bytes)
    if (this.completedArchiveBytes + this.reservedBytes + bytes > this.byteBudget)
      throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '源码归档缓存预算不足')
    this.reservedBytes += bytes
    this.updatePeak()
  }

  private evictArchiveEntriesFor(incomingBytes: number) {
    while (this.completedArchiveBytes + this.reservedBytes + incomingBytes > this.byteBudget) {
      if (!this.evictOldestArchive())
        break
    }
  }

  private evictOldestArchive() {
    const oldest = [...this.archives.entries()]
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
    if (!oldest)
      return false
    this.archives.delete(oldest[0])
    this.completedArchiveBytes -= oldest[1].bytes.byteLength
    return true
  }

  private evictRevisionEntries() {
    while (this.revisions.size > this.maxRevisionEntries) {
      const oldest = [...this.revisions.entries()]
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
      if (!oldest)
        return
      this.revisions.delete(oldest[0])
    }
  }

  private updatePeak() {
    this.peakAccountedBytes = Math.max(
      this.peakAccountedBytes,
      this.completedArchiveBytes + this.reservedBytes,
    )
  }

  private async withDownloadSlot<T>(operation: () => Promise<T>, signal?: AbortSignal) {
    let release!: () => void
    const previous = this.downloadTail
    this.downloadTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      throwIfAborted(signal)
      return await operation()
    }
    finally {
      release()
    }
  }
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`Invalid ${field}`)
  return value
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason
}

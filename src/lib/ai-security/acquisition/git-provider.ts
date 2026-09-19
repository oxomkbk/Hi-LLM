import { Buffer } from 'node:buffer'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

import { AiSecurityError } from '../errors'
import { parseProviderUrl } from './provider-url'

import type { ParsedProviderUrl } from './provider-url'
import type { LookupAddress } from 'node:dns'
import type { IncomingMessage } from 'node:http'
import type { LookupFunction } from 'node:net'

const FIXED_REQUEST_HOSTS = new Set(['api.github.com', 'codeload.github.com', 'github.com', 'gitlab.com'])
const JSON_LIMIT_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const SHA_PATTERN = /^[0-9a-f]{40}$/i

export type GitRevisionStrategy = 'provider_rest' | 'smart_http'
export type GitSourceAcquisitionPhase = 'archive' | 'revision'
export type GitSourceConnectionReason = 'circuit_open' | 'connect' | 'timeout'

export interface GitSourceDownload {
  archive: Uint8Array
  providerUrl: ParsedProviderUrl
  sourceRevision: string
}

export interface ResolvedGitSource {
  providerUrl: ParsedProviderUrl
  sourceRevision: string
}

export class GitSourceConnectionError extends AiSecurityError {
  readonly host: string
  readonly phase: GitSourceAcquisitionPhase
  readonly reason: GitSourceConnectionReason

  constructor(input: {
    cause?: Error
    host: string
    phase: GitSourceAcquisitionPhase
    reason: GitSourceConnectionReason
  }) {
    super(
      'SECURITY_SOURCE_FETCH_FAILED',
      input.reason === 'circuit_open'
        ? `${input.host} 在本次批量评测中不可达，已跳过重复连接`
        : `无法连接源码平台 ${input.host}`,
      input.cause ? { cause: input.cause } : undefined,
    )
    this.host = input.host
    this.phase = input.phase
    this.reason = input.reason
    this.name = 'GitSourceConnectionError'
  }
}

export function buildGitSourceArchiveUrl(providerUrl: ParsedProviderUrl, revision: string) {
  const sourceRevision = normalizeFixedGitRevision(revision)
  if (!sourceRevision)
    throw new AiSecurityError('SECURITY_SOURCE_INVALID', '源码归档下载必须使用固定提交版本')
  return providerUrl.provider === 'github'
    ? new URL(`https://codeload.github.com/${encodeURIComponent(providerUrl.projectPath.split('/')[0]!)}/${encodeURIComponent(providerUrl.repository)}/zip/${sourceRevision}`)
    : gitlabArchiveUrl(providerUrl.projectPath, sourceRevision)
}

export function createPinnedProviderLookup(selected: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [selected])
      return
    }
    callback(null, selected.address, selected.family)
  }
}

export async function downloadGitSourceArchive(input: {
  maxArchiveBytes?: number
  providerUrl: ParsedProviderUrl
  signal?: AbortSignal
  sourceRevision: string
}) {
  const archiveUrl = buildGitSourceArchiveUrl(input.providerUrl, input.sourceRevision)
  return secureProviderRequest(archiveUrl, {
    headers: providerHeaders(input.providerUrl.provider),
    maximumBytes: clamp(input.maxArchiveBytes ?? 100 * 1024 * 1024, 1024, 512 * 1024 * 1024),
    phase: 'archive',
    signal: input.signal,
  })
}

export function isGitSourceConnectionError(error: unknown): error is GitSourceConnectionError {
  return error instanceof GitSourceConnectionError
}

export function isPublicInternetAddress(address: string) {
  const version = isIP(address)
  if (version === 4)
    return isPublicIpv4(address)
  if (version !== 6)
    return false
  const normalized = address.toLowerCase().split('%')[0]!
  const mapped = normalized.match(/^(?:0*:){5}ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped)
    return isPublicIpv4(mapped[1]!)
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('2001:db8:'))
    return false
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return first >= 0x2000 && first <= 0x3FFF
}

export function normalizeFixedGitRevision(value: string) {
  return SHA_PATTERN.test(value) ? value.toLowerCase() : null
}

export function parseGitUploadPackAdvertisement(bytes: Uint8Array, requestedRef: string) {
  const refs = new Map<string, string>()
  let offset = 0
  let serviceSeen = false
  let refsStarted = false
  let terminalFlushSeen = false
  while (offset < bytes.byteLength) {
    if (offset + 4 > bytes.byteLength)
      invalidPktLine()
    const header = Buffer.from(bytes.subarray(offset, offset + 4)).toString('ascii')
    if (!/^[0-9a-f]{4}$/i.test(header))
      invalidPktLine()
    const length = Number.parseInt(header, 16)
    offset += 4
    if (length === 0) {
      if (!serviceSeen)
        invalidPktLine()
      if (refsStarted)
        terminalFlushSeen = true
      else
        refsStarted = true
      continue
    }
    if (terminalFlushSeen)
      invalidPktLine()
    if (length < 4 || offset + length - 4 > bytes.byteLength)
      invalidPktLine()
    let payload: string
    try {
      payload = new TextDecoder('utf-8', { fatal: true })
        .decode(bytes.subarray(offset, offset + length - 4))
    }
    catch {
      invalidPktLine()
    }
    offset += length - 4
    if (!serviceSeen) {
      if (payload !== '# service=git-upload-pack\n')
        invalidPktLine()
      serviceSeen = true
      continue
    }
    if (!refsStarted)
      invalidPktLine()
    if (payload === 'version 1\n' && refs.size === 0)
      continue
    const line = payload.endsWith('\n') ? payload.slice(0, -1) : payload
    const refRecord = line.split('\0', 1)[0]!
    const separator = refRecord.indexOf(' ')
    if (separator !== 40)
      invalidPktLine()
    const objectId = refRecord.slice(0, separator)
    const refName = refRecord.slice(separator + 1)
    const hasControlCharacter = [...refName].some((character) => {
      const point = character.codePointAt(0) ?? 0
      return point <= 31 || point === 127
    })
    if (!SHA_PATTERN.test(objectId) || !refName || hasControlCharacter)
      invalidPktLine()
    refs.set(refName, objectId.toLowerCase())
  }
  if (!serviceSeen || !refsStarted || !terminalFlushSeen)
    invalidPktLine()
  const selected = requestedRef === 'HEAD'
    ? refs.get('HEAD')
    : refs.get(`refs/heads/${requestedRef}`)
      ?? refs.get(`refs/tags/${requestedRef}^{}`)
      ?? refs.get(`refs/tags/${requestedRef}`)
  if (!selected)
    throw new AiSecurityError('SECURITY_SOURCE_INVALID', 'Git smart-HTTP 未返回请求的固定版本')
  return selected
}

export async function requestAcrossProviderAddresses<T>(
  addresses: readonly LookupAddress[],
  operation: (address: LookupAddress) => Promise<T>,
) {
  const candidates = [...new Map(addresses.map(address => [`${address.family}:${address.address}`, address])).values()]
    .sort((left, right) => Number(right.family === 4) - Number(left.family === 4))
    .slice(0, 3)
  let lastError: unknown = new Error('No provider address available')
  for (const address of candidates) {
    try {
      return await operation(address)
    }
    catch (error) {
      lastError = error
      if ((error instanceof AiSecurityError && !isGitSourceConnectionError(error))
        || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error
      }
    }
  }
  throw lastError
}

export async function resolveAndDownloadGitSource(input: {
  maxArchiveBytes?: number
  signal?: AbortSignal
  sourceUrl: string
  strategy?: GitRevisionStrategy
}): Promise<GitSourceDownload> {
  const resolved = await resolveGitSourceRevision(input)
  const archive = await downloadGitSourceArchive({
    maxArchiveBytes: input.maxArchiveBytes,
    providerUrl: resolved.providerUrl,
    signal: input.signal,
    sourceRevision: resolved.sourceRevision,
  })
  return { archive, ...resolved }
}

export async function resolveGitSourceRevision(input: {
  signal?: AbortSignal
  sourceUrl: string
  strategy?: GitRevisionStrategy
}): Promise<ResolvedGitSource> {
  const providerUrl = parseProviderUrl(input.sourceUrl)
  const sourceRevision = normalizeFixedGitRevision(providerUrl.ref) ?? (
    input.strategy === 'smart_http'
      ? await resolveSmartHttpRevision(providerUrl, input.signal)
      : providerUrl.provider === 'github'
        ? await resolveGithubRevision(providerUrl, input.signal)
        : await resolveGitlabRevision(providerUrl, input.signal)
  )
  return { providerUrl, sourceRevision: sourceRevision.toLowerCase() }
}

export function securitySourceHttpError(statusCode?: number) {
  const status = statusCode ?? 502
  const code = status === 429 || status >= 500
    ? 'SECURITY_SOURCE_TRANSIENT'
    : 'SECURITY_SOURCE_INVALID'
  return new AiSecurityError(code, `源码平台请求失败（HTTP ${status}）`)
}

export function selectProviderAddress(addresses: readonly LookupAddress[]) {
  return addresses.find(address => address.family === 4) ?? addresses[0] ?? null
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value))
    return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}

async function collectResponse(response: IncomingMessage, maximum: number) {
  if (response.statusCode !== 200) {
    response.resume()
    throw securitySourceHttpError(response.statusCode)
  }
  const declared = Number(response.headers['content-length'] || 0)
  if (declared > maximum) {
    response.destroy()
    throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '源码归档超出允许大小')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const rawChunk of response) {
    const chunk = Buffer.from(rawChunk)
    size += chunk.byteLength
    if (size > maximum) {
      response.destroy()
      throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '源码归档超出允许大小')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

function gitlabArchiveUrl(projectPath: string, revision: string) {
  const url = new URL(`https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath)}/repository/archive.zip`)
  url.searchParams.set('sha', revision)
  return url
}

function invalidPktLine(): never {
  throw new AiSecurityError('SECURITY_SOURCE_INVALID', 'Git smart-HTTP pkt-line 数据无效')
}

function isPublicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
    return false
  const [a, b, c] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224)
    return false
  if (a === 100 && b >= 64 && b <= 127)
    return false
  if (a === 169 && b === 254)
    return false
  if (a === 172 && b >= 16 && b <= 31)
    return false
  if (a === 192 && (b === 0 || b === 168))
    return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    return false
  if (a === 203 && b === 0 && c === 113)
    return false
  return true
}

function providerHeaders(provider: 'github' | 'gitlab') {
  const headers: Record<string, string> = {
    'Accept': provider === 'github' ? 'application/vnd.github+json' : 'application/json',
    'Accept-Encoding': 'identity',
    'User-Agent': 'hillm-nav-ai-security/1',
  }
  const token = provider === 'github'
    ? process.env.AI_SECURITY_GITHUB_TOKEN?.trim()
    : process.env.AI_SECURITY_GITLAB_TOKEN?.trim()
  if (token)
    headers[provider === 'github' ? 'Authorization' : 'PRIVATE-TOKEN'] = provider === 'github' ? `Bearer ${token}` : token
  return headers
}

async function providerJson(url: URL, headers: Record<string, string>, signal?: AbortSignal) {
  const raw = await secureProviderRequest(url, {
    headers,
    maximumBytes: JSON_LIMIT_BYTES,
    phase: 'revision',
    signal,
  })
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected object')
    return value as Record<string, unknown>
  }
  catch {
    throw new AiSecurityError('SECURITY_SOURCE_INVALID', '源码平台返回了无效数据')
  }
}

function requestProviderAddress(url: URL, input: {
  expectedContentType?: string
  headers: Record<string, string>
  maximumBytes: number
  phase: GitSourceAcquisitionPhase
  signal?: AbortSignal
}, selected: LookupAddress) {
  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false
    let timedOut = false
    const finish = (callback: () => void) => {
      if (settled)
        return
      settled = true
      callback()
    }
    const request = httpsRequest(url, {
      headers: input.headers,
      lookup: createPinnedProviderLookup(selected),
      method: 'GET',
      servername: url.hostname,
      signal: input.signal,
    }, (response) => {
      const remoteAddress = response.socket.remoteAddress ?? ''
      if (!isPublicInternetAddress(remoteAddress)) {
        response.destroy()
        finish(() => reject(new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码平台连接到了非公开地址')))
        return
      }
      if (response.statusCode === 200) {
        const contentType = String(response.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase()
        if (input.expectedContentType && contentType !== input.expectedContentType) {
          response.destroy()
          finish(() => reject(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码平台返回了无效 Content-Type')))
          return
        }
      }
      collectResponse(response, input.maximumBytes).then(
        bytes => finish(() => resolve(bytes)),
        (error) => {
          const normalized = error instanceof AiSecurityError || input.signal?.aborted
            ? input.signal?.reason ?? error
            : new GitSourceConnectionError({
                cause: error instanceof Error ? error : new Error('Response stream failed'),
                host: url.hostname,
                phase: input.phase,
                reason: 'connect',
              })
          finish(() => reject(normalized))
        },
      )
    })
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      timedOut = true
      request.destroy(new Error('timeout'))
    })
    request.once('error', (error) => {
      if (input.signal?.aborted) {
        finish(() => reject(input.signal!.reason))
        return
      }
      finish(() => reject(new GitSourceConnectionError({
        cause: error,
        host: url.hostname,
        phase: input.phase,
        reason: timedOut ? 'timeout' : 'connect',
      })))
    })
    request.end()
  })
}

function requiredSha(value: unknown) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value))
    throw new AiSecurityError('SECURITY_SOURCE_INVALID', '源码平台未返回固定提交版本')
  return value
}

async function resolveGithubRevision(source: ParsedProviderUrl, signal?: AbortSignal) {
  const [owner] = source.projectPath.split('/')
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(source.repository)}/commits/${encodeURIComponent(source.ref)}`)
  const payload = await providerJson(url, providerHeaders('github'), signal)
  return requiredSha(payload.sha)
}

async function resolveGitlabRevision(source: ParsedProviderUrl, signal?: AbortSignal) {
  const project = encodeURIComponent(source.projectPath)
  const url = new URL(`https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(source.ref)}`)
  const payload = await providerJson(url, providerHeaders('gitlab'), signal)
  return requiredSha(payload.id)
}

async function resolveSmartHttpRevision(source: ParsedProviderUrl, signal?: AbortSignal) {
  const url = smartHttpAdvertisementUrl(source)
  const raw = await secureProviderRequest(url, {
    expectedContentType: 'application/x-git-upload-pack-advertisement',
    headers: {
      'Accept': 'application/x-git-upload-pack-advertisement',
      'Accept-Encoding': 'identity',
      'Git-Protocol': 'version=1',
      'User-Agent': 'hillm-nav-ai-security/1',
    },
    maximumBytes: JSON_LIMIT_BYTES,
    phase: 'revision',
    signal,
  })
  return parseGitUploadPackAdvertisement(raw, source.ref)
}

async function secureProviderRequest(url: URL, input: {
  expectedContentType?: string
  headers: Record<string, string>
  maximumBytes: number
  phase: GitSourceAcquisitionPhase
  signal?: AbortSignal
}) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !FIXED_REQUEST_HOSTS.has(url.hostname.toLowerCase()))
    throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码平台请求地址不在允许范围')
  let addresses: LookupAddress[]
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true })
  }
  catch (error) {
    if (input.signal?.aborted)
      throw input.signal.reason
    throw new GitSourceConnectionError({
      cause: error instanceof Error ? error : new Error('DNS lookup failed'),
      host: url.hostname,
      phase: input.phase,
      reason: 'connect',
    })
  }
  if (addresses.length === 0) {
    throw new GitSourceConnectionError({
      cause: new Error('DNS lookup returned no addresses'),
      host: url.hostname,
      phase: input.phase,
      reason: 'connect',
    })
  }
  if (addresses.some(item => !isPublicInternetAddress(item.address)))
    throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码平台域名解析到了非公开地址')
  if (!selectProviderAddress(addresses))
    throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码平台没有可用的公开地址')

  return requestAcrossProviderAddresses(addresses, selected => requestProviderAddress(url, input, selected))
}

function smartHttpAdvertisementUrl(source: ParsedProviderUrl) {
  const path = source.projectPath.split('/').map(encodeURIComponent).join('/')
  const url = new URL(`https://${source.host}/${path}.git/info/refs`)
  url.searchParams.set('service', 'git-upload-pack')
  return url
}

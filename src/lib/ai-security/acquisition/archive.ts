import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import yauzl from 'yauzl'

import { normalizeSecurityPath } from '../canonical-json'
import { AiSecurityError } from '../errors'
import { isPriorityRepositoryMaterialPath, selectPriorityRepositoryMaterial } from './priority-material'

import type { AcquiredSourceFile, AcquiredSourceManifest } from './manifest'
import type { Entry, ZipFile } from 'yauzl'

export interface PreparedSourceArchive {
  archive: Uint8Array
  manifest: AcquiredSourceManifest
}

export interface SourceArchiveLimits {
  maxArchiveBytes: number
  maxDepth: number
  maxFileBytes: number
  maxFiles: number
  maxMaterializedBytes: number
}

const DEFAULT_LIMITS: SourceArchiveLimits = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxDepth: 32,
  maxFileBytes: 2 * 1024 * 1024,
  maxFiles: 5000,
  maxMaterializedBytes: 30 * 1024 * 1024,
}

interface ReadArchiveEntry {
  bytes: Uint8Array
  path: string
}

export function createStoredZip(files: readonly { bytes: Uint8Array, mode?: number, path: string }[]) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const path = normalizeSecurityPath(file.path)
    const name = Buffer.from(path, 'utf8')
    const data = Buffer.from(file.bytes)
    if (name.byteLength > 0xFFFF || data.byteLength > 0xFFFFFFFF)
      limitExceeded('ZIP 文件条目超出格式限制')
    const checksum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(data.byteLength, 18)
    local.writeUInt32LE(data.byteLength, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014B50, 0)
    central.writeUInt16LE(0x0314, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(data.byteLength, 20)
    central.writeUInt32LE(data.byteLength, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE((file.mode ?? 0o100400) * 0x10000, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.byteLength + name.byteLength + data.byteLength
  }
  if (files.length > 0xFFFF)
    limitExceeded('ZIP 文件数量超出格式限制')
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, end])
}

export async function inspectSourceArchive(input: {
  archive: Uint8Array
  includePath?: (path: string) => boolean
  limits?: Partial<SourceArchiveLimits>
  subdirectory?: string | null
}): Promise<AcquiredSourceManifest> {
  const limits = normalizeLimits(input.limits)
  if (input.archive.byteLength < 1 || input.archive.byteLength > limits.maxArchiveBytes)
    limitExceeded('源码压缩包大小超出限制')
  const subdirectory = input.subdirectory ? normalizeSecurityPath(input.subdirectory) : null
  const entries = await readZipEntries(Buffer.from(input.archive), limits, subdirectory, input.includePath)
  const rootPrefix = commonProviderRoot(entries.map(entry => entry.path))
  const files: AcquiredSourceFile[] = []
  const paths = new Set<string>()
  let totalBytes = 0

  for (const entry of entries) {
    const withoutRoot = rootPrefix ? entry.path.slice(rootPrefix.length + 1) : entry.path
    if (!withoutRoot)
      continue
    if (subdirectory && withoutRoot !== subdirectory && !withoutRoot.startsWith(`${subdirectory}/`))
      continue
    const relative = subdirectory
      ? withoutRoot.slice(subdirectory.length).replace(/^\//, '')
      : withoutRoot
    if (!relative)
      continue
    const path = normalizeSecurityPath(relative)
    if (paths.has(path))
      invalidArchive('源码压缩包存在重复路径')
    paths.add(path)
    totalBytes += entry.bytes.byteLength
    if (totalBytes > limits.maxMaterializedBytes)
      limitExceeded('源码解包体积超出限制')
    files.push({
      bytes: entry.bytes,
      path,
      sha256: createHash('sha256').update(entry.bytes).digest('hex'),
    })
  }
  files.sort((left, right) => left.path.localeCompare(right.path))
  return {
    fileCount: files.length,
    files,
    paths,
    totalBytes,
  }
}

export async function prepareSkillSourceArchive(input: {
  archive: Uint8Array
  limits?: Partial<SourceArchiveLimits>
  subdirectory?: string | null
  subjectSlug?: string | null
}): Promise<PreparedSourceArchive> {
  const manifest = await inspectSourceArchive({
    ...input,
    includePath: path => isPriorityRepositoryMaterialPath(path, 'skill', input.subjectSlug),
  })
  const selected = selectPriorityRepositoryMaterial({
    files: manifest.files,
    subjectKind: 'skill',
    subjectSlug: input.subjectSlug,
  })
  if (!selected.files.some(file => /(?:^|\/)SKILL\.md$/i.test(file.path)))
    throw new AiSecurityError('SECURITY_SOURCE_INVALID', 'Skill 源码根目录缺少 SKILL.md')
  const archive = createStoredZip(manifest.files.map(file => ({ bytes: file.bytes, path: file.path })))
  const limits = normalizeLimits(input.limits)
  if (archive.byteLength > limits.maxArchiveBytes)
    limitExceeded('扫描输入压缩包大小超出限制')
  return { archive, manifest }
}

function archiveEntryMatches(path: string, subdirectory: null | string, includePath: (path: string) => boolean) {
  const firstSeparator = path.indexOf('/')
  const variants = firstSeparator === -1 ? [path] : [path, path.slice(firstSeparator + 1)]
  return variants.some((candidate) => {
    if (!subdirectory)
      return includePath(candidate)
    if (candidate !== subdirectory && !candidate.startsWith(`${subdirectory}/`))
      return false
    const relative = candidate.slice(subdirectory.length).replace(/^\//, '')
    return Boolean(relative && includePath(relative))
  })
}

function commonProviderRoot(paths: readonly string[]) {
  if (paths.length === 0)
    invalidArchive('源码压缩包为空')
  const first = paths[0]!.split('/')[0]!
  return paths.every(path => path.includes('/') && path.startsWith(`${first}/`)) ? first : null
}

function crc32(bytes: Uint8Array) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc & 1) ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function invalidArchive(message: string): never {
  throw new AiSecurityError('SECURITY_SOURCE_INVALID', message)
}

function isEntryWithinSubdirectory(path: string, subdirectory: string) {
  const firstSeparator = path.indexOf('/')
  const withoutProviderRoot = firstSeparator === -1 ? path : path.slice(firstSeparator + 1)
  return withoutProviderRoot === subdirectory || withoutProviderRoot.startsWith(`${subdirectory}/`)
}

function limitExceeded(message: string): never {
  throw new AiSecurityError('SOURCE_LIMIT_EXCEEDED', message)
}

function normalizeLimits(value: Partial<SourceArchiveLimits> | undefined): SourceArchiveLimits {
  const limits = { ...DEFAULT_LIMITS, ...value }
  for (const [key, number] of Object.entries(limits)) {
    if (!Number.isSafeInteger(number) || number < 1)
      throw new TypeError(`Invalid source archive limit: ${key}`)
  }
  return limits
}

function openZip(bytes: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { decodeStrings: true, lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip)
        reject(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码压缩包格式无效', { cause: error ?? undefined }))
      else
        resolve(zip)
    })
  })
}

function readEntry(zip: ZipFile, entry: Entry, maximum: number) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码文件读取失败', { cause: error ?? undefined }))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > maximum) {
          stream.destroy()
          reject(new AiSecurityError('SOURCE_LIMIT_EXCEEDED', '源码文件大小超出限制'))
          return
        }
        chunks.push(chunk)
      })
      stream.once('error', () => reject(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码文件读取失败')))
      stream.once('end', () => {
        if (size !== entry.uncompressedSize) {
          reject(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码文件大小校验失败'))
          return
        }
        resolve(Buffer.concat(chunks, size))
      })
    })
  })
}

async function readZipEntries(
  bytes: Buffer,
  limits: SourceArchiveLimits,
  subdirectory: string | null,
  includePath?: (path: string) => boolean,
) {
  const zip = await openZip(bytes)
  return new Promise<ReadArchiveEntry[]>((resolve, reject) => {
    const entries: ReadArchiveEntry[] = []
    const seen = new Set<string>()
    let totalBytes = 0
    let settled = false
    const fail = (error: unknown) => {
      if (settled)
        return
      settled = true
      zip.close()
      reject(error)
    }
    zip.once('error', () => fail(new AiSecurityError('SECURITY_SOURCE_INVALID', '源码压缩包读取失败')))
    zip.once('end', () => {
      if (!settled) {
        settled = true
        resolve(entries)
      }
    })
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        const path = safeEntryPath(entry.fileName, limits.maxDepth)
        if (seen.has(path))
          invalidArchive('源码压缩包存在重复路径')
        seen.add(path)
        if (subdirectory && !isEntryWithinSubdirectory(path, subdirectory)) {
          zip.readEntry()
          return
        }
        const mode = entry.externalFileAttributes >>> 16
        const fileType = mode & 0o170000
        const directory = entry.fileName.endsWith('/') || fileType === 0o040000
        if ((entry.generalPurposeBitFlag & 1) !== 0 || (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000)) {
          zip.readEntry()
          return
        }
        if (directory) {
          zip.readEntry()
          return
        }
        if (includePath && !archiveEntryMatches(path, subdirectory, includePath)) {
          zip.readEntry()
          return
        }
        if (entries.length >= limits.maxFiles || entry.uncompressedSize > limits.maxFileBytes)
          limitExceeded('源码文件数量或单文件大小超出限制')
        if (entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 200))
          limitExceeded('源码压缩比异常')
        totalBytes += entry.uncompressedSize
        if (totalBytes > limits.maxMaterializedBytes)
          limitExceeded('源码解包体积超出限制')
        const content = await readEntry(zip, entry, limits.maxFileBytes)
        entries.push({ bytes: content, path })
        zip.readEntry()
      })().catch(fail)
    })
    zip.readEntry()
  })
}

function safeEntryPath(value: string, maxDepth: number) {
  const normalized = value.normalize('NFC').replace(/\/$/, '')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\')
    || [...normalized].some(character => (character.codePointAt(0) ?? 0) <= 31)) {
    invalidArchive('源码压缩包包含不安全路径')
  }
  const parts = normalized.split('/')
  if (parts.length > maxDepth || parts.some(part => !part || part === '.' || part === '..') || parts[0]?.includes(':'))
    invalidArchive('源码压缩包包含不安全路径')
  try {
    return normalizeSecurityPath(parts.join('/'))
  }
  catch {
    invalidArchive('源码压缩包包含不安全路径')
  }
}

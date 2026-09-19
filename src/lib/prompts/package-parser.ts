import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import sanitizeHtml from 'sanitize-html'
import yauzl from 'yauzl'

import type {
  PromptAssetRole,
  PromptContentKind,
  PromptDocumentRole,
  PromptImportCandidate,
  PromptImportReport,
} from '@/types'

const MAX_ENTRIES = 512
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_TEXT_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_RATIO = 100
const MAX_DEPTH = 12

const TEXT_EXTENSIONS = new Set(['css', 'htm', 'html', 'js', 'json', 'jsx', 'less', 'md', 'mdx', 'scss', 'svelte', 'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml'])
const IMAGE_EXTENSIONS = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'webm'])
const BINARY_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, 'pdf', 'woff', 'woff2'])

export interface ParsedPromptEntry extends PromptImportCandidate {
  content?: string
  extension: string
  kind: 'asset' | 'document'
}

export interface ParsedPromptPackage {
  entries: ParsedPromptEntry[]
  report: PromptImportReport
}

interface PromptPackageMeta {
  categories: string[]
  compatibility: string[]
  contentKind: PromptContentKind
  primaryCategory?: string
  primaryPrompt?: string
  schemaVersion: 1
  slug: string
  summary: string
  tags: string[]
  title: string
}

interface ReadArchiveResult {
  entries: ParsedPromptEntry[]
  entryCount: number
  totalUncompressedBytes: number
}

export async function extractPromptAssets(zipPath: string, entries: ParsedPromptEntry[], destination: string) {
  await mkdir(destination, { recursive: true })
  const wanted = new Map(entries.filter(entry => entry.kind === 'asset').map(entry => [entry.path, entry]))
  const extracted: Array<ParsedPromptEntry & { filePath: string }> = []
  const zip = await openZip(zipPath)

  return new Promise<Array<ParsedPromptEntry & { filePath: string }>>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled)
        return
      settled = true
      zip.close()
      reject(error)
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (!settled) {
        settled = true
        resolve(extracted)
      }
    })
    zip.on('entry', (entry) => {
      const normalized = normalizeArchivePath(entry.fileName)
      const candidate = wanted.get(normalized)
      if (!candidate) {
        zip.readEntry()
        return
      }
      zip.openReadStream(entry, async (error, stream) => {
        if (error || !stream) {
          fail(error ?? new Error('无法读取压缩包资源'))
          return
        }
        try {
          const outputPath = path.join(destination, `${extracted.length}-${path.basename(candidate.path)}`)
          if (candidate.extension === 'html' || candidate.extension === 'htm') {
            const chunks: Buffer[] = []
            for await (const chunk of stream)
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            const safe = sanitizePreviewHtml(Buffer.concat(chunks).toString('utf8'))
            const { writeFile } = await import('node:fs/promises')
            await writeFile(outputPath, safe, 'utf8')
          }
          else {
            await pipeline(stream, createWriteStream(outputPath, { flags: 'wx' }))
          }
          extracted.push({ ...candidate, filePath: outputPath })
          zip.readEntry()
        }
        catch (streamError) {
          fail(streamError)
        }
      })
    })
    zip.readEntry()
  })
}

export function inferPromptEntry(sourcePath: string, size: number): Omit<ParsedPromptEntry, 'content'> | null {
  const normalized = normalizeArchivePath(sourcePath)
  const extension = path.extname(normalized).slice(1).toLowerCase()
  const basename = path.basename(normalized).toLowerCase()
  if (!TEXT_EXTENSIONS.has(extension) && !BINARY_EXTENSIONS.has(extension))
    return null

  if (IMAGE_EXTENSIONS.has(extension)) {
    const role: PromptAssetRole = /poster/.test(basename) ? 'poster' : /cover|thumb/.test(basename) ? 'cover' : 'image'
    return { extension, kind: 'asset', language: extension, path: normalized, role, size }
  }
  if (VIDEO_EXTENSIONS.has(extension))
    return { extension, kind: 'asset', language: extension, path: normalized, role: 'video', size }
  if (extension === 'pdf' || extension === 'woff' || extension === 'woff2')
    return { extension, kind: 'asset', language: extension, path: normalized, role: 'attachment', size }
  if ((extension === 'html' || extension === 'htm') && (/^preview\//i.test(normalized) || /(?:^|\/)(?:index|preview)\.html?$/i.test(normalized)))
    return { extension, kind: 'asset', language: 'html', path: normalized, role: 'web_preview', size }

  let role: PromptDocumentRole = 'other'
  if (/negative|avoid|exclude/.test(basename))
    role = 'negative_prompt'
  else if (/^prompts?\//i.test(normalized) || /(?:^|\/)(?:prompt|main|system)\.(?:mdx?|txt)$/i.test(normalized))
    role = 'prompt'
  else if (/^readme(?:\.|$)/i.test(basename))
    role = 'readme'
  else if (/tokens?/.test(basename))
    role = 'tokens'
  else if (/param|config/.test(basename))
    role = 'parameters'
  else if (/^styles?\//i.test(normalized) || ['css', 'scss', 'less'].includes(extension))
    role = 'style'
  else if (/design|spec/.test(basename))
    role = 'design'
  else if (/example|sample/.test(basename))
    role = 'example'
  return { extension, kind: 'document', language: extension || 'text', path: normalized, role, size }
}

export function normalizeArchivePath(input: string) {
  const normalized = input.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalized.split('/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || segments.some(segment => segment === '' || segment === '.' || segment === '..'))
    throw new Error(`压缩包包含不安全路径：${input}`)
  if (segments.length > MAX_DEPTH)
    throw new Error(`压缩包目录层级不能超过 ${MAX_DEPTH} 层`)
  return normalized
}

export async function parsePromptPackage(zipPath: string): Promise<ParsedPromptPackage> {
  const archive = await readArchive(zipPath)
  const archiveEntries = archive.entries
  const blocking: string[] = []
  const warnings: string[] = []
  const metaEntry = archiveEntries.find(entry => entry.path.toLowerCase() === 'meta.json')
  let metadata: PromptPackageMeta | null = null

  if (!metaEntry?.content) {
    blocking.push('压缩包根目录缺少 meta.json')
  }
  else {
    try {
      metadata = validateMeta(JSON.parse(metaEntry.content))
    }
    catch (error) {
      blocking.push(error instanceof Error ? error.message : 'meta.json 格式无效')
    }
  }

  const entries = archiveEntries.filter(entry => entry.path.toLowerCase() !== 'meta.json')
  const promptCandidates = entries.filter(entry => entry.kind === 'document' && entry.role === 'prompt')
  let primaryPromptPath = metadata?.primaryPrompt ? normalizeArchivePath(metadata.primaryPrompt) : null
  if (primaryPromptPath && !promptCandidates.some(entry => entry.path === primaryPromptPath)) {
    blocking.push(`meta.json 指定的主提示词不存在：${primaryPromptPath}`)
    primaryPromptPath = null
  }
  if (!primaryPromptPath) {
    const conventional = promptCandidates.filter(entry => /(?:^|\/)(?:prompt|main|system)(?:\.[^.]+)?$/i.test(entry.path))
    if (conventional.length === 1)
      primaryPromptPath = conventional[0]!.path
    else if (promptCandidates.length === 1)
      primaryPromptPath = promptCandidates[0]!.path
    else if (promptCandidates.length === 0)
      blocking.push('未识别到提示词文件；请放入 prompts/ 目录或在 meta.json 指定 primaryPrompt')
    else
      blocking.push('识别到多份提示词，请在 meta.json 的 primaryPrompt 指定主提示词')
  }

  if (!entries.some(entry => entry.kind === 'asset'))
    warnings.push('压缩包没有图片、视频或网页预览资源，前台将使用默认封面')
  if (!entries.some(entry => entry.role === 'readme'))
    warnings.push('没有识别到 README 文档')

  return {
    entries,
    report: {
      assets: entries.filter(entry => entry.kind === 'asset').map(toCandidate),
      blocking,
      documents: entries.filter(entry => entry.kind === 'document').map(toCandidate),
      entryCount: archive.entryCount,
      metadata: metadata
        ? {
            categories: metadata.categories,
            compatibility: metadata.compatibility,
            contentKind: metadata.contentKind,
            primaryCategory: metadata.primaryCategory,
            slug: metadata.slug,
            summary: metadata.summary,
            tags: metadata.tags,
            title: metadata.title,
          }
        : null,
      primaryPromptPath,
      schemaVersion: metadata?.schemaVersion ?? null,
      totalUncompressedBytes: archive.totalUncompressedBytes,
      warnings,
    },
  }
}

export function sanitizePreviewHtml(input: string) {
  const noImports = input.replace(/@import\s[^;]+;?/gi, '').replace(/url\(\s*(['"]?)https?:[^)]+\)/gi, 'none')
  return sanitizeHtml(noImports, {
    allowedAttributes: {
      '*': ['aria-*', 'class', 'data-*', 'id', 'role', 'style', 'title'],
      'a': ['href', 'rel', 'target'],
      'img': ['alt', 'height', 'src', 'width'],
      'video': ['autoplay', 'controls', 'height', 'loop', 'muted', 'playsinline', 'poster', 'src', 'width'],
      'source': ['src', 'type'],
    },
    allowedSchemes: [],
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['article', 'aside', 'button', 'footer', 'header', 'main', 'nav', 'section', 'style', 'video', 'source']),
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attribs) => ({
        attribs: { ...attribs, href: safeRelativeUrl(attribs.href), rel: 'noreferrer noopener', target: '_blank' },
        tagName: 'a',
      }),
      img: (_tagName, attribs) => ({ attribs: { ...attribs, src: safeRelativeUrl(attribs.src) }, tagName: 'img' }),
      source: (_tagName, attribs) => ({ attribs: { ...attribs, src: safeRelativeUrl(attribs.src) }, tagName: 'source' }),
      video: (_tagName, attribs) => ({ attribs: { ...attribs, poster: safeRelativeUrl(attribs.poster), src: safeRelativeUrl(attribs.src) }, tagName: 'video' }),
    },
  })
}

function openZip(zipPath: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { autoClose: true, lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip)
        reject(new Error('无法解析 ZIP 压缩包'))
      else
        resolve(zip)
    })
  })
}

function optionalString(value: unknown, max: number) {
  if (value === undefined || value === null)
    return ''
  if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > max)
    throw new Error('meta.json 包含无效文本字段')
  return value.trim()
}

async function readArchive(zipPath: string) {
  const zip = await openZip(zipPath)
  const entries: ParsedPromptEntry[] = []
  let totalBytes = 0
  let totalTextBytes = 0
  let entryCount = 0
  const seenPaths = new Set<string>()

  return new Promise<ReadArchiveResult>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled)
        return
      settled = true
      zip.close()
      reject(error)
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (!settled) {
        settled = true
        resolve({ entries, entryCount, totalUncompressedBytes: totalBytes })
      }
    })
    zip.on('entry', (entry) => {
      try {
        entryCount += 1
        if (entryCount > MAX_ENTRIES)
          throw new Error(`压缩包文件数不能超过 ${MAX_ENTRIES}`)
        if (/\/$/.test(entry.fileName)) {
          normalizeArchivePath(entry.fileName.slice(0, -1))
          zip.readEntry()
          return
        }
        const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
        if (unixMode === 0o120000)
          throw new Error('压缩包不能包含符号链接')
        if (entry.uncompressedSize < 0 || entry.compressedSize < 0)
          throw new Error('压缩包包含无效文件大小')
        if (entry.compressedSize === 0 ? entry.uncompressedSize > 0 : entry.uncompressedSize / entry.compressedSize > MAX_RATIO)
          throw new Error(`文件压缩率异常：${entry.fileName}`)
        totalBytes += entry.uncompressedSize
        if (totalBytes > MAX_TOTAL_BYTES)
          throw new Error('压缩包解压后不能超过 500MB')

        const normalized = normalizeArchivePath(entry.fileName)
        if (seenPaths.has(normalized))
          throw new Error(`压缩包包含重复路径：${normalized}`)
        seenPaths.add(normalized)
        const candidate = normalized.toLowerCase() === 'meta.json'
          ? { extension: 'json', kind: 'document' as const, language: 'json', path: normalized, role: 'other' as const, size: entry.uncompressedSize }
          : inferPromptEntry(normalized, entry.uncompressedSize)
        if (!candidate) {
          zip.readEntry()
          return
        }
        if (candidate.kind === 'document') {
          if (entry.uncompressedSize > MAX_TEXT_BYTES)
            throw new Error(`文本文件不能超过 2MB：${normalized}`)
          totalTextBytes += entry.uncompressedSize
          if (totalTextBytes > MAX_TEXT_TOTAL_BYTES)
            throw new Error('压缩包内文本文件合计不能超过 20MB')
          zip.openReadStream(entry, async (error, stream) => {
            if (error || !stream) {
              fail(error ?? new Error('无法读取压缩包文本'))
              return
            }
            try {
              const chunks: Buffer[] = []
              let received = 0
              for await (const chunk of stream) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
                received += buffer.length
                if (received > MAX_TEXT_BYTES)
                  throw new Error(`文本文件不能超过 2MB：${normalized}`)
                chunks.push(buffer)
              }
              entries.push({ ...candidate, content: Buffer.concat(chunks).toString('utf8') })
              zip.readEntry()
            }
            catch (streamError) {
              fail(streamError)
            }
          })
          return
        }
        entries.push(candidate)
        zip.readEntry()
      }
      catch (error) {
        fail(error)
      }
    })
    zip.readEntry()
  })
}

function requiredString(value: unknown, field: string, max: number) {
  const result = optionalString(value, max)
  if (!result)
    throw new Error(`meta.json 缺少 ${field}`)
  return result
}

function safeRelativeUrl(value?: string) {
  if (!value)
    return ''
  const trimmed = value.trim()
  return trimmed.startsWith('#') || /^(?:\.\.?\/)?[\w/-]+(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.test(trimmed) ? trimmed : ''
}

function stringArray(value: unknown, field: string, max: number) {
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 80))
    throw new Error(`meta.json 的 ${field} 格式无效`)
  return [...new Set(value.map(item => String(item).trim()))]
}

function toCandidate(entry: ParsedPromptEntry): PromptImportCandidate {
  return { language: entry.language, path: entry.path, role: entry.role, size: entry.size }
}

function validateMeta(value: unknown): PromptPackageMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('meta.json 必须是 JSON 对象')
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1)
    throw new Error('meta.json 仅支持 schemaVersion: 1')
  if (!['adaptation', 'image', 'video', 'web_ui'].includes(String(input.contentKind)))
    throw new Error('meta.json 的 contentKind 无效')
  const categories = stringArray(input.categories, 'categories', 16)
  if (!categories.length)
    throw new Error('meta.json 至少需要一个 categories 分类')
  const primaryCategory = optionalString(input.primaryCategory, 80)
  if (primaryCategory && !categories.includes(primaryCategory))
    throw new Error('meta.json 的 primaryCategory 必须包含在 categories 中')
  return {
    categories,
    compatibility: stringArray(input.compatibility ?? [], 'compatibility', 20),
    contentKind: input.contentKind as PromptContentKind,
    primaryCategory: primaryCategory || undefined,
    primaryPrompt: optionalString(input.primaryPrompt, 300) || undefined,
    schemaVersion: 1,
    slug: requiredString(input.slug, 'slug', 80),
    summary: requiredString(input.summary, 'summary', 500),
    tags: stringArray(input.tags ?? [], 'tags', 12),
    title: requiredString(input.title, 'title', 120),
  }
}

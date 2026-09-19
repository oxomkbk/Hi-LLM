import type { AcquiredSourceFile } from './manifest'

const DEFAULT_MAX_FILES = 12
const DEFAULT_MAX_TEXT_BYTES = 256 * 1024
const MARKDOWN_NAME_PATTERN = /^(?:readme|skill|install(?:ation)?|security|config(?:uration)?)(?:[._-][^.]+)?\.md$/i
const MANIFEST_NAME_PATTERN = /^(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|go\.mod|\.env\.example)$/i
const TEXT_EXTENSION_PATTERN = /\.(?:json|md|mdx|toml|txt|yaml|yml)$/i

export interface PriorityRepositoryMaterial {
  files: AcquiredSourceFile[]
  inspectedBytes: number
  scopeDirectory: null | string
  skippedFileCount: number
  truncatedPaths: string[]
}

export function isPriorityRepositoryMaterialPath(
  path: string,
  subjectKind: 'mcp' | 'skill',
  subjectSlug?: null | string,
) {
  const name = baseName(path)
  if ((!TEXT_EXTENSION_PATTERN.test(path) && !MANIFEST_NAME_PATTERN.test(name))
    || (!MARKDOWN_NAME_PATTERN.test(name) && !MANIFEST_NAME_PATTERN.test(name))) {
    return false
  }
  if (!path.includes('/'))
    return true
  if (subjectKind === 'skill') {
    if (/^skill\.md$/i.test(name))
      return true
    const slug = subjectSlug ? normalizeSlug(subjectSlug) : ''
    return Boolean(slug && directoryName(path).split('/').some(part => slugMatchesDirectory(slug, normalizeSlug(part))))
  }
  return pathDepth(path) <= 2
}

export function selectPriorityRepositoryMaterial(input: {
  files: readonly AcquiredSourceFile[]
  maxFiles?: number
  maxTextBytes?: number
  subjectKind: 'mcp' | 'skill'
  subjectSlug?: null | string
}): PriorityRepositoryMaterial {
  const maxFiles = positiveInteger(input.maxFiles ?? DEFAULT_MAX_FILES, 'maxFiles')
  const maxTextBytes = positiveInteger(input.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES, 'maxTextBytes')
  const scopeDirectory = input.subjectKind === 'skill'
    ? selectSkillScope(input.files, input.subjectSlug ?? null)
    : null
  const candidates = input.files
    .map(file => ({ file, priority: materialPriority(file.path, input.subjectKind, scopeDirectory) }))
    .filter((candidate): candidate is { file: AcquiredSourceFile, priority: number } => candidate.priority !== null)
    .sort((left, right) => left.priority - right.priority
      || pathDepth(left.file.path) - pathDepth(right.file.path)
      || left.file.path.localeCompare(right.file.path))

  const files: AcquiredSourceFile[] = []
  const truncatedPaths: string[] = []
  let inspectedBytes = 0
  for (const { file } of candidates) {
    if (files.length >= maxFiles || inspectedBytes >= maxTextBytes)
      break
    const remaining = maxTextBytes - inspectedBytes
    const bytes = file.bytes.byteLength > remaining ? file.bytes.subarray(0, remaining) : file.bytes
    if (bytes.byteLength < file.bytes.byteLength)
      truncatedPaths.push(file.path)
    files.push({ ...file, bytes })
    inspectedBytes += bytes.byteLength
  }

  return {
    files,
    inspectedBytes,
    scopeDirectory,
    skippedFileCount: Math.max(0, input.files.length - files.length),
    truncatedPaths,
  }
}

function baseName(path: string) {
  return path.split('/').at(-1) ?? path
}

function directoryName(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

function isWithin(path: string, directory: null | string) {
  if (directory === null)
    return !path.includes('/')
  return path.startsWith(`${directory}/`)
}

function materialPriority(path: string, kind: 'mcp' | 'skill', scopeDirectory: null | string) {
  const name = baseName(path)
  if (!TEXT_EXTENSION_PATTERN.test(path) && !MANIFEST_NAME_PATTERN.test(name))
    return null
  const root = !path.includes('/')
  const scoped = isWithin(path, scopeDirectory)
  if (kind === 'skill' && scoped && /^skill\.md$/i.test(name))
    return 0
  if (scoped && /^readme(?:[._-][^.]+)?\.md$/i.test(name))
    return kind === 'mcp' ? 0 : 1
  if (root && /^readme(?:[._-][^.]+)?\.md$/i.test(name))
    return kind === 'mcp' ? 0 : 2
  if (scoped && MANIFEST_NAME_PATTERN.test(name))
    return kind === 'mcp' ? 1 : 3
  if (root && MANIFEST_NAME_PATTERN.test(name))
    return kind === 'mcp' ? 1 : 4
  if (scoped && MARKDOWN_NAME_PATTERN.test(name))
    return kind === 'mcp' ? 2 : 5
  if (root && MARKDOWN_NAME_PATTERN.test(name))
    return kind === 'mcp' ? 2 : 6
  if (kind === 'mcp' && MARKDOWN_NAME_PATTERN.test(name) && pathDepth(path) <= 2)
    return 3
  return null
}

function normalizeSlug(value: string) {
  return value.normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function pathDepth(path: string) {
  return path.split('/').length - 1
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${field} must be a positive integer`)
  return value
}

function selectSkillScope(files: readonly AcquiredSourceFile[], subjectSlug: null | string) {
  const skillFiles = files.filter(file => /^skill\.md$/i.test(baseName(file.path)))
  if (skillFiles.length === 0)
    return null
  const slug = subjectSlug ? normalizeSlug(subjectSlug) : ''
  if (slug) {
    const matches = skillFiles.filter((file) => {
      const directory = directoryName(file.path)
      return directory.split('/').some(part => slugMatchesDirectory(slug, normalizeSlug(part)))
    })
    if (matches.length > 0) {
      matches.sort((left, right) => pathDepth(left.path) - pathDepth(right.path) || left.path.localeCompare(right.path))
      return directoryName(matches[0]!.path)
    }
  }
  return skillFiles.length === 1 ? directoryName(skillFiles[0]!.path) : null
}

function slugMatchesDirectory(subjectSlug: string, directorySlug: string) {
  if (subjectSlug === directorySlug)
    return true
  if (directorySlug.length < 4 || ['skill', 'skills'].includes(directorySlug))
    return false
  return subjectSlug.endsWith(`-${directorySlug}`)
}

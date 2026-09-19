import { AiSecurityError } from '../errors'
import { normalizeSecurityPath } from '../security-path'

export interface ParsedProviderUrl {
  canonicalUrl: string
  host: 'github.com' | 'gitlab.com'
  projectPath: string
  provider: SupportedGitProvider
  ref: string
  repository: string
  subdirectory: string | null
}

export type SupportedGitProvider = 'github' | 'gitlab'

export function parseProviderUrl(value: string): ParsedProviderUrl {
  let url: URL
  try {
    url = new URL(value.normalize('NFC').trim())
  }
  catch {
    invalidSourceUrl()
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash)
    invalidSourceUrl()
  if (host !== 'github.com' && host !== 'gitlab.com')
    throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '首版安全评测仅支持公开 GitHub/GitLab 源码地址')
  const parts = decodedPathParts(url.pathname)
  return host === 'github.com' ? parseGithub(parts) : parseGitlab(parts)
}

function canonicalProjectPart(value: string) {
  const normalized = value.endsWith('.git') ? value.slice(0, -4) : value
  if (!/^[\w.-]{1,100}$/.test(normalized) || normalized === '.' || normalized === '..')
    invalidSourceUrl()
  return normalized
}

function canonicalRef(value: string | undefined) {
  const normalized = value?.normalize('NFC').trim() ?? 'HEAD'
  if (!normalized || normalized.length > 200 || normalized === '.' || normalized === '..'
    || normalized.includes('/') || normalized.includes('\\') || hasControlCharacter(normalized)) {
    throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码分支或标签格式无效；包含斜杠的 ref 请改用固定提交页面')
  }
  return normalized
}

function decodedPathParts(pathname: string) {
  try {
    return pathname.split('/').filter(Boolean).map((part) => {
      const value = decodeURIComponent(part).normalize('NFC')
      if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || hasControlCharacter(value))
        invalidSourceUrl()
      return value
    })
  }
  catch (error) {
    if (error instanceof AiSecurityError)
      throw error
    invalidSourceUrl()
  }
}

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const point = character.codePointAt(0) ?? 0
    return point <= 31 || point === 127
  })
}

function invalidSourceUrl(): never {
  throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', '源码地址格式无效')
}

function normalizedSubdirectory(parts: string[]) {
  if (parts.length === 0)
    return null
  try {
    return normalizeSecurityPath(parts.join('/'))
  }
  catch {
    invalidSourceUrl()
  }
}

function parseGithub(parts: string[]): ParsedProviderUrl {
  if (parts.length < 2)
    invalidSourceUrl()
  const owner = canonicalProjectPart(parts[0]!)
  const repository = canonicalProjectPart(parts[1]!)
  let ref = 'HEAD'
  let subdirectory: string | null = null
  if (parts.length > 2) {
    if (parts[2] !== 'tree' || parts.length < 4)
      throw new AiSecurityError('SECURITY_SOURCE_NOT_ALLOWED', 'GitHub 源码地址必须指向仓库或 tree 子目录')
    ref = canonicalRef(parts[3])
    subdirectory = normalizedSubdirectory(parts.slice(4))
  }
  const suffix = ref === 'HEAD' ? '' : `/tree/${encodeURIComponent(ref)}${subdirectory ? `/${subdirectory}` : ''}`
  return {
    canonicalUrl: `https://github.com/${owner}/${repository}${suffix}`,
    host: 'github.com',
    projectPath: `${owner}/${repository}`,
    provider: 'github',
    ref,
    repository,
    subdirectory,
  }
}

function parseGitlab(parts: string[]): ParsedProviderUrl {
  const marker = parts.findIndex((part, index) => part === '-' && parts[index + 1] === 'tree')
  const projectParts = marker === -1 ? parts : parts.slice(0, marker)
  if (projectParts.length < 2)
    invalidSourceUrl()
  const normalizedProject = projectParts.map(canonicalProjectPart)
  const repository = normalizedProject.at(-1)!
  const ref = marker === -1 ? 'HEAD' : canonicalRef(parts[marker + 2])
  const subdirectory = marker === -1 ? null : normalizedSubdirectory(parts.slice(marker + 3))
  if (marker !== -1 && parts.length < marker + 3)
    invalidSourceUrl()
  const projectPath = normalizedProject.join('/')
  const suffix = ref === 'HEAD' ? '' : `/-/tree/${encodeURIComponent(ref)}${subdirectory ? `/${subdirectory}` : ''}`
  return {
    canonicalUrl: `https://gitlab.com/${projectPath}${suffix}`,
    host: 'gitlab.com',
    projectPath,
    provider: 'gitlab',
    ref,
    repository,
    subdirectory,
  }
}

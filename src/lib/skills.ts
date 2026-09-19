import { parseProviderUrl } from './ai-security/acquisition/provider-url'
import { AiSecurityError } from './ai-security/errors'
import { normalizeCatalogFileReference } from './catalog-icons'
import { SKILL_CATEGORIES, SKILL_PLATFORMS, SKILL_SOURCE_KINDS } from './skill-constants'

import type { SkillContent, SkillSaveParams, SkillSourceKind, SkillStatus } from '@/types'

const DISALLOWED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home', '.lan', '.test', '.invalid']
const RAW_HTML_PATTERN = /<(?:!doctype|!--|\/?[a-z][^>]*)>/i
const FALLBACK_HASH_LENGTH = 8

export { SKILL_CATEGORIES, SKILL_PLATFORMS, SKILL_SCENARIOS, SKILL_SOURCE_KINDS } from './skill-constants'
export const SKILL_SELECT = 'id,slug,name,summary,description,category,tags,platforms,source_kind,source_url,homepage_url,install_command,author_name,author_url,version,license,icon,status,featured,verified,sort,publish_requested_at,published_by,published_at,created_at,updated_at'
export const SKILL_SUBMISSION_SELECT = 'id,slug,name,summary,description,category,tags,platforms,source_kind,source_url,homepage_url,install_command,author_name,author_url,version,license,icon,status,submitter_name,submitter_email,submitted_ip_hash,review_note,reviewer_id,reviewed_at,security_target_id,security_review_status,security_pending_reason,created_at,updated_at'

export interface SanitizedSubmitter {
  submitter_email: string | null
  submitter_name: string
}

export function createSkillSlug(value: unknown) {
  const input = typeof value === 'string' ? value : ''
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '')

  return slug.length >= 2 ? slug : `skill-${stableSlugHash(input).slice(0, FALLBACK_HASH_LENGTH)}`
}

export function inferSkillSourceKind(sourceUrl: string | null): SkillSourceKind {
  if (!sourceUrl)
    return 'platform_content'
  return isSupportedRepositoryUrl(sourceUrl) ? 'git_repository' : 'external_page'
}

export async function readSkillJsonBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 64 * 1024)
    throw new Error('提交内容不能超过 64KB')

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 64 * 1024)
    throw new Error('提交内容不能超过 64KB')

  let input: unknown
  try {
    input = JSON.parse(text)
  }
  catch {
    throw new Error('JSON 格式无效')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('提交内容格式无效')

  return input as Record<string, unknown>
}

export function sanitizeReviewNote(value: unknown) {
  return readText(value, 500, '审核备注') || null
}

export function sanitizeSkillAdminInput(input: Record<string, unknown>): SkillSaveParams {
  const status = input.status === undefined ? 'draft' : input.status
  if (!isSkillStatus(status))
    throw new Error('Skill 状态无效')

  return {
    ...sanitizeSkillInput(input),
    featured: readBoolean(input.featured, false, '精选状态'),
    sort: readSort(input.sort),
    status,
    verified: readBoolean(input.verified, false, '认证状态'),
  }
}

export function sanitizeSkillInput(input: Record<string, unknown>, options: { generateSlug?: boolean } = {}): SkillContent {
  const name = readText(input.name, 100, 'Skill 名称', true)
  const summary = readText(input.summary, 240, 'Skill 简介', true)
  const description = readText(input.description, 6000, 'Skill 详情', true)
  const category = readText(input.category, 20, 'Skill 分类', true)
  const requestedSlug = options.generateSlug ? name : readText(input.slug, 80, 'Skill 地址') || name

  if (RAW_HTML_PATTERN.test(description) || RAW_HTML_PATTERN.test(summary))
    throw new Error('Skill 内容不能包含原始 HTML')
  if (!(SKILL_CATEGORIES as readonly string[]).includes(category))
    throw new Error('Skill 分类无效')

  const source = normalizeSkillSource(input.source_kind, input.source_url)

  return {
    author_name: readText(input.author_name, 80, '作者名称', true),
    author_url: normalizePublicHttpsUrl(input.author_url, '作者链接'),
    category,
    description,
    homepage_url: normalizePublicHttpsUrl(input.homepage_url, '项目主页'),
    icon: normalizeCatalogIcon(input.icon, 'Skill 图标'),
    install_command: readText(input.install_command, 500, '安装命令') || null,
    license: readText(input.license, 50, '开源协议') || null,
    name,
    platforms: normalizePlatforms(input.platforms),
    slug: createSkillSlug(requestedSlug),
    source_kind: source.kind,
    source_url: source.url,
    summary,
    tags: normalizeTags(input.tags),
    version: readText(input.version, 32, '版本号') || null,
  }
}

export function sanitizeSkillSearchTerm(value: string | null) {
  if (!value)
    return ''

  return readText(value, 100, '搜索关键词')
    .replace(/[^\p{L}\p{N}\s+#._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeSubmitter(input: Record<string, unknown>, fallbackName: string): SanitizedSubmitter {
  const email = readText(input.submitter_email, 254, '投稿人邮箱')
  if (email && !isValidEmail(email))
    throw new Error('投稿人邮箱格式无效')

  return {
    submitter_email: email ? email.toLowerCase() : null,
    submitter_name: readText(input.submitter_name, 80, '投稿人名称') || fallbackName,
  }
}

function isSkillStatus(value: unknown): value is SkillStatus {
  return value === 'draft' || value === 'published' || value === 'archived'
}

function isSupportedRepositoryUrl(value: string) {
  try {
    parseProviderUrl(value)
    return true
  }
  catch (error) {
    if (error instanceof AiSecurityError && error.code === 'SECURITY_SOURCE_NOT_ALLOWED')
      return false
    throw error
  }
}

function isValidEmail(value: string) {
  const atIndex = value.indexOf('@')
  const domain = value.slice(atIndex + 1)
  return atIndex > 0
    && atIndex === value.lastIndexOf('@')
    && domain.includes('.')
    && !/\s/.test(value)
    && !domain.startsWith('.')
    && !domain.endsWith('.')
}

function normalizeCatalogIcon(value: unknown, fieldName: string) {
  const input = readText(value, 2048, fieldName)
  if (!input)
    return null

  const fileReference = normalizeCatalogFileReference(input)
  if (fileReference)
    return fileReference
  if (input.startsWith('file:') || input.startsWith('/api/files/'))
    throw new Error(`${fieldName}文件引用格式无效`)

  return normalizePublicHttpsUrl(input, fieldName, true)
}

function normalizePlatforms(value: unknown) {
  if (!Array.isArray(value))
    throw new Error('请至少选择一个适用平台')

  const platforms = [...new Set(value.map(item => readText(item, 30, '适用平台', true)))]
  if (platforms.length === 0 || platforms.length > SKILL_PLATFORMS.length)
    throw new Error('请至少选择一个有效的适用平台')
  if (platforms.some(platform => !(SKILL_PLATFORMS as readonly string[]).includes(platform)))
    throw new Error('适用平台无效')

  return platforms
}

function normalizePublicHttpsUrl(value: unknown, fieldName: string, required = false) {
  const input = readText(value, 2048, fieldName, required)
  if (!input)
    return null

  let url: URL
  try {
    url = new URL(input)
  }
  catch {
    throw new Error(`${fieldName}格式无效`)
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error(`${fieldName}必须是公开 HTTPS 地址`)

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const isIpLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
  const isPrivateName = hostname === 'localhost' || DISALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  if (!hostname.includes('.') || isIpLiteral || isPrivateName)
    throw new Error(`${fieldName}必须使用可公开访问的域名`)

  url.hash = ''
  return url.toString()
}

function normalizeSkillSource(kindValue: unknown, urlValue: unknown) {
  const requestedKind = kindValue === undefined || kindValue === null || kindValue === ''
    ? null
    : readText(kindValue, 40, '来源类型', true)
  if (requestedKind && !(SKILL_SOURCE_KINDS as readonly string[]).includes(requestedKind))
    throw new Error('Skill 来源类型无效')

  if (requestedKind === 'platform_content') {
    if (readText(urlValue, 2048, 'Skill 源地址'))
      throw new Error('站内原创内容不需要填写来源地址')
    return { kind: 'platform_content' as const, url: null }
  }

  const url = normalizePublicHttpsUrl(urlValue, 'Skill 源地址', true)!
  const repository = isSupportedRepositoryUrl(url)
  const kind = (requestedKind ?? (repository ? 'git_repository' : 'external_page')) as SkillSourceKind

  if (kind === 'git_repository' && !repository)
    throw new Error('Git 仓库来源仅支持公开的 GitHub 或 GitLab 仓库、tree 子目录地址')
  if (kind === 'external_page' && repository)
    throw new Error('该地址是可扫描的 GitHub/GitLab 仓库，请选择“Git 仓库”来源')

  return { kind, url }
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value))
    throw new Error('Skill 标签格式无效')

  const tags = [...new Set(value.map(item => readText(item, 24, 'Skill 标签', true)))]
  if (tags.length > 10)
    throw new Error('Skill 标签最多 10 个')

  return tags
}

function readBoolean(value: unknown, defaultValue: boolean, fieldName: string) {
  if (value === undefined)
    return defaultValue
  if (typeof value !== 'boolean')
    throw new Error(`${fieldName}格式无效`)
  return value
}

function readSort(value: unknown) {
  if (value === undefined)
    return 1
  const sort = Number(value)
  if (!Number.isInteger(sort) || sort < 1 || sort > 99)
    throw new Error('排序值必须是 1 到 99 的整数')
  return sort
}

function readText(value: unknown, maxLength: number, fieldName: string, required = false) {
  if (value === undefined || value === null) {
    if (required)
      throw new Error(`请填写${fieldName}`)
    return ''
  }
  if (typeof value !== 'string')
    throw new Error(`${fieldName}格式无效`)

  const result = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
    })
    .join('')
    .trim()

  if (required && !result)
    throw new Error(`请填写${fieldName}`)
  if (Array.from(result).length > maxLength)
    throw new Error(`${fieldName}不能超过 ${maxLength} 个字符`)

  return result
}

function stableSlugHash(value: string) {
  let hash = 0x811C9DC5
  for (const character of value.normalize('NFKC')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(FALLBACK_HASH_LENGTH, '0')
}

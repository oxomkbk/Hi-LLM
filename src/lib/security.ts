import { createHmac } from 'node:crypto'

import {
  NAVIGATION_AI_REQUEST_HEADER,
  NAVIGATION_AI_REQUEST_HEADER_VALUE,
} from './navigation-ai/request-transport'
import { isUuid } from './uuid'

import type { NextRequest } from 'next/server'

const DISALLOWED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home', '.lan', '.test', '.invalid']

export { isUuid } from './uuid'

export const MAX_LOGO_SIZE = 1024 * 1024
export const ACCEPTED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

export interface SanitizedWebsiteInput {
  category_id: string
  category_ids: string[]
  name: string
  url: string
  desc: string
  tags: string[]
  pinned: boolean
  recommend: boolean
  vpn: boolean
  commonlyUsed: boolean
  sort: number
}

export class RequestOriginValidationError extends Error {
  readonly code = 'REQUEST_ORIGIN_INVALID'
  readonly status = 403

  constructor() {
    super('请求来源校验失败')
    this.name = 'RequestOriginValidationError'
  }
}

export function assertNavigationAiRequestOrigin(request: NextRequest) {
  const allowedOrigins = collectAllowedRequestOrigins(request)
  if (allowedOrigins.size === 0)
    throw new RequestOriginValidationError()

  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') {
    if (allowedOrigins.has(origin))
      return
    throw new RequestOriginValidationError()
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      if (allowedOrigins.has(new URL(referer).origin))
        return
    }
    catch {
      // 无效来源不得继续降级到更弱的请求信号。
    }
    throw new RequestOriginValidationError()
  }

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) {
    if (fetchSite.toLowerCase() === 'same-origin')
      return
    throw new RequestOriginValidationError()
  }

  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const requestMarker = request.headers.get(NAVIGATION_AI_REQUEST_HEADER)
  if (mediaType === 'application/json' && requestMarker === NAVIGATION_AI_REQUEST_HEADER_VALUE)
    return

  throw new RequestOriginValidationError()
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  const allowedOrigins = collectAllowedRequestOrigins(request)

  if (!origin || allowedOrigins.size === 0 || !allowedOrigins.has(origin))
    throw new RequestOriginValidationError()
}

/**
 * 文件读取不能因为未配置反向代理而完全不可用。
 * 有可信代理时按来源 IP 限流；本地或直连部署按客户端特征分桶，
 * 并由文件读取层的全局计数器兜底。哈希优先使用独立盐，缺省复用认证密钥。
 */
export function createFileReadIdentity(request: NextRequest) {
  const address = getTrustedClientAddress(request)
  const fingerprint = [
    request.headers.get('user-agent') ?? '',
    request.headers.get('accept-language') ?? '',
    request.headers.get('sec-ch-ua') ?? '',
  ].join('|').slice(0, 1_024)
  const value = address ? `ip:${address}` : `direct:${fingerprint || 'anonymous'}`
  const salt = process.env.SUBMISSION_IP_HASH_SALT || process.env.AUTH_SECRET
  if (!salt)
    throw new Error('缺少文件访问安全哈希密钥')
  return createHmac('sha256', salt).update(`file-read:${value}`).digest('hex')
}

export function createSecurityHash(scope: string, value: string) {
  // 独立盐便于密钥轮换；未配置时安全复用认证根密钥，避免本地部署直接 500。
  const salt = process.env.SUBMISSION_IP_HASH_SALT || process.env.AUTH_SECRET
  if (!salt)
    throw new Error('缺少访问安全哈希密钥')
  return createHmac('sha256', salt).update(`${scope}:${value.trim().toLowerCase()}`).digest('hex')
}

/**
 * 匿名写入端点只能在可信反向代理之后读取转发地址。
 * 生产环境缺少这一边界时失败关闭，避免把可伪造请求头当作限流身份。
 */
export function createTrustedVisitorHash(request: NextRequest, scope: string) {
  const address = getTrustedClientAddress(request)
  const localAddress = isLocalBrowserRequest(request) ? '127.0.0.1' : ''
  const visitorAddress = address || localAddress || (process.env.NODE_ENV !== 'production' ? '127.0.0.1' : '')
  if (!visitorAddress)
    throw new Error('匿名投稿安全网关尚未配置')
  return createSecurityHash(scope, visitorAddress)
}

export function normalizePublicHttpsUrl(value: unknown) {
  const input = readString(value, 2048, '网站链接', true)
  let url: URL

  try {
    url = new URL(input)
  }
  catch {
    throw new Error('请输入合法的网站链接')
  }

  if (url.protocol !== 'https:')
    throw new Error('网站链接必须使用 HTTPS')
  if (url.username || url.password)
    throw new Error('网站链接不能包含账号或密码')
  if (url.port && url.port !== '443')
    throw new Error('网站链接不能使用非标准端口')

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const isIpLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
  const isPrivateName = hostname === 'localhost' || DISALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))

  if (!hostname.includes('.') || isIpLiteral || isPrivateName)
    throw new Error('网站链接必须使用可公开访问的域名')

  url.hash = ''
  return url.toString()
}

export function normalizeWebsiteCategoryIds(value: unknown) {
  const values = Array.isArray(value) ? value : [value]
  const categoryIds = [...new Set(values)]
  if (!categoryIds.length || categoryIds.some(categoryId => !isUuid(categoryId)))
    throw new Error('请至少选择一个有效的网站分类')
  if (categoryIds.length > 8)
    throw new Error('一个网站最多选择 8 个分类')
  return categoryIds as string[]
}

export function sanitizeWebsiteInput(input: Record<string, unknown>, allowAdminFields = false): SanitizedWebsiteInput {
  const categoryIds = normalizeWebsiteCategoryIds(input.category_ids ?? input.category_id)

  const requestedSort = Number(input.sort)

  return {
    category_id: categoryIds[0]!,
    category_ids: categoryIds,
    name: readString(input.name, 100, '网站名称', true),
    url: normalizePublicHttpsUrl(input.url),
    desc: readString(input.desc, 500, '网站描述'),
    tags: normalizeTags(input.tags),
    pinned: allowAdminFields ? input.pinned === true : false,
    recommend: allowAdminFields ? input.recommend === true : false,
    vpn: input.vpn === true,
    commonlyUsed: allowAdminFields ? input.commonlyUsed === true : false,
    sort: allowAdminFields && Number.isInteger(requestedSort) && requestedSort >= 1 && requestedSort <= 99
      ? requestedSort
      : 1,
  }
}

export function stripControlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 31 && code !== 127
    })
    .join('')
}

export async function validateLogoFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0)
    throw new Error('请上传网站 Logo')
  if (value.size > MAX_LOGO_SIZE)
    throw new Error('Logo 大小不能超过 1MB')
  if (!ACCEPTED_LOGO_TYPES.includes(value.type as typeof ACCEPTED_LOGO_TYPES[number]))
    throw new Error('Logo 仅支持 PNG、JPG、WebP 或 ICO')

  const bytes = new Uint8Array(await value.slice(0, 16).arrayBuffer())
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
  const isWebp = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'

  const isIco = bytes.length >= 4
    && bytes[0] === 0x00
    && bytes[1] === 0x00
    && bytes[2] === 0x01
    && bytes[3] === 0x00

  if (
    (value.type === 'image/png' && !isPng)
    || (value.type === 'image/jpeg' && !isJpeg)
    || (value.type === 'image/webp' && !isWebp)
    || (['image/x-icon', 'image/vnd.microsoft.icon'].includes(value.type) && !isIco)
  ) {
    throw new Error('Logo 文件内容与格式不一致')
  }

  const extension = value.type === 'image/png'
    ? 'png'
    : value.type === 'image/jpeg'
      ? 'jpg'
      : value.type === 'image/webp'
        ? 'webp'
        : 'ico'
  return { file: value, extension }
}

function collectAllowedRequestOrigins(request: NextRequest) {
  const allowedOrigins = new Set<string>()
  const configuredOrigins = [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]

  for (const configuredOrigin of configuredOrigins) {
    if (!configuredOrigin)
      continue
    try {
      allowedOrigins.add(new URL(configuredOrigin).origin)
    }
    catch {
      // 无效配置不加入白名单。
    }
  }

  if (process.env.NODE_ENV !== 'production')
    allowedOrigins.add(request.nextUrl.origin)

  return allowedOrigins
}

function getTrustedClientAddress(request: NextRequest) {
  const configuredHeader = process.env.AUTH_IP_HEADER?.trim()
  const hasConfiguredAuthProxy = Boolean(configuredHeader && process.env.AUTH_TRUSTED_PROXY_CIDRS?.trim())
  if (hasConfiguredAuthProxy)
    return request.headers.get(configuredHeader!)?.trim() || ''

  if (process.env.TRUST_PROXY_HEADERS !== 'true' && !process.env.VERCEL)
    return ''
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || ''
}

function isLocalBrowserRequest(request: NextRequest) {
  if (!isLocalHostname(request.nextUrl.hostname))
    return false

  const origin = request.headers.get('origin')
  if (!origin)
    return false

  try {
    return isLocalHostname(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const tags = rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => readString(tag, 20, '标签'))
    .filter(Boolean)

  return [...new Set(tags)].slice(0, 8)
}

function readString(value: unknown, maxLength: number, fieldName: string, required = false) {
  if (typeof value !== 'string') {
    if (required)
      throw new Error(`请填写${fieldName}`)
    return ''
  }

  const result = stripControlCharacters(value).trim()
  if (required && !result)
    throw new Error(`请填写${fieldName}`)
  if (result.length > maxLength)
    throw new Error(`${fieldName}不能超过 ${maxLength} 个字符`)
  return result
}

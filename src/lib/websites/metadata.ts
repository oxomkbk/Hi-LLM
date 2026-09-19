import 'server-only'

import { stripControlCharacters } from '@/lib/security'

import { fetchPublicResource } from './public-resource'

import type { WebsiteExtractionIcon } from '@/types'
import type { Buffer } from 'node:buffer'

const HTML_LIMIT_BYTES = 1536 * 1024
const ICON_LIMIT_BYTES = 1024 * 1024

interface ParsedMetadata {
  description: string
  iconUrls: string[]
  name: string
  title: string
}

export async function extractWebsiteIcon(iconUrls: string[]): Promise<WebsiteExtractionIcon | null> {
  for (const iconUrl of iconUrls.slice(0, 8)) {
    try {
      const resource = await fetchPublicResource(iconUrl, {
        accept: 'image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon;q=0.9,*/*;q=0.1',
        maxBytes: ICON_LIMIT_BYTES,
      })
      const detected = detectImage(resource.body)
      if (!detected)
        continue
      return {
        dataUrl: `data:${detected.mimeType};base64,${resource.body.toString('base64')}`,
        filename: `favicon.${detected.extension}`,
        mimeType: detected.mimeType,
        size: resource.body.length,
      }
    }
    catch {
      // 单个候选失败时继续尝试其他站点图标。
    }
  }
  return null
}

export async function extractWebsiteMetadata(inputUrl: string, options: { timeoutMs?: number } = {}) {
  const page = await fetchPublicResource(inputUrl, {
    accept: 'text/html,application/xhtml+xml;q=0.9',
    maxBytes: HTML_LIMIT_BYTES,
    timeoutMs: options.timeoutMs,
  })
  if (!page.contentType.includes('text/html') && !page.contentType.includes('application/xhtml+xml'))
    throw new Error('该地址不是网页')

  const html = decodeHtml(page.body, page.contentType)
  const metadata = parseWebsiteMetadata(html, page.finalUrl)
  return { ...metadata, finalUrl: page.finalUrl }
}

export function parseWebsiteMetadata(html: string, pageUrl: string): ParsedMetadata {
  const meta = new Map<string, string>()
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const attributes = parseAttributes(tag)
    const key = (attributes.property || attributes.name || attributes.itemprop || '').toLowerCase()
    const content = cleanExtractedText(attributes.content || '', 1_000)
    if (key && content && !meta.has(key))
      meta.set(key, content)
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)
  const title = cleanExtractedText(titleMatch?.[1] || meta.get('og:title') || '', 200)
  const siteName = cleanExtractedText(
    meta.get('og:site_name')
    || meta.get('application-name')
    || meta.get('apple-mobile-web-app-title')
    || '',
    100,
  )
  const fallbackName = new URL(pageUrl).hostname.replace(/^www\./i, '')
  const name = (siteName || titleName(title) || fallbackName).slice(0, 100)
  const description = cleanExtractedText(
    meta.get('description')
    || meta.get('og:description')
    || meta.get('twitter:description')
    || '',
    1_000,
  )

  const iconCandidates: { score: number, url: string }[] = []
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attributes = parseAttributes(tag)
    const rel = (attributes.rel || '').toLowerCase()
    if (!rel.split(/\s+/).some(value => value === 'icon' || value === 'shortcut' || value === 'apple-touch-icon'))
      continue
    if (!attributes.href)
      continue
    try {
      const resolved = new URL(attributes.href, pageUrl)
      if (resolved.protocol !== 'https:')
        continue
      const sizes = attributes.sizes?.match(/(\d+)x(\d+)/i)
      const sizeScore = sizes ? Math.min(512, Number(sizes[1])) : 0
      const formatScore = /\.(?:png|webp)(?:$|\?)/i.test(resolved.href) ? 80 : 0
      iconCandidates.push({ score: sizeScore + formatScore, url: resolved.toString() })
    }
    catch {
      // 忽略无法解析的图标地址。
    }
  }

  const originFavicon = new URL('/favicon.ico', pageUrl).toString()
  const iconUrls = [...new Set([
    ...iconCandidates.sort((left, right) => right.score - left.score).map(item => item.url),
    originFavicon,
  ])]

  return { description, iconUrls, name, title }
}

function cleanExtractedText(value: string, maxLength: number) {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .split(/\r?\n|\t/)
    .map(stripControlCharacters)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (_match, decimal, hex, name) => {
    if (decimal)
      return safeCodePoint(Number(decimal))
    if (hex)
      return safeCodePoint(Number.parseInt(hex, 16))
    return named[String(name).toLowerCase()] ?? _match
  })
}

function decodeHtml(body: Buffer, contentType: string) {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]
  const prefix = body.subarray(0, 4_096).toString('latin1')
  const metaCharset = prefix.match(/charset\s*=\s*["']?([^;\s"'>]+)/i)?.[1]
  const charset = (headerCharset || metaCharset || 'utf-8').toLowerCase()
  try {
    return new TextDecoder(charset).decode(body)
  }
  catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

function detectImage(body: Buffer) {
  if (body.length >= 8 && body[0] === 0x89 && body.subarray(1, 4).toString('ascii') === 'PNG')
    return { extension: 'png', mimeType: 'image/png' }
  if (body.length >= 3 && body[0] === 0xFF && body[1] === 0xD8 && body[2] === 0xFF)
    return { extension: 'jpg', mimeType: 'image/jpeg' }
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP')
    return { extension: 'webp', mimeType: 'image/webp' }
  if (body.length >= 4 && body[0] === 0x00 && body[1] === 0x00 && body[2] === 0x01 && body[3] === 0x00)
    return { extension: 'ico', mimeType: 'image/x-icon' }
  return null
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {}
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase()
    if (name)
      attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function safeCodePoint(value: number) {
  try {
    return value > 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : ''
  }
  catch {
    return ''
  }
}

function titleName(title: string) {
  const parts = title.split(/\s+[-|—–]\s+|[_｜]/).map(part => part.trim()).filter(Boolean)
  const candidate = parts.find(part => Array.from(part).length >= 2 && Array.from(part).length <= 100)
  return candidate || title
}

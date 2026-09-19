import { isIP } from 'node:net'

import { isUuid } from '../uuid'
import { isPublicIpAddress } from '../websites/public-address'
import { normalizeWonderlandDocument } from './content'
import { WONDER_WORK_KINDS } from './domain'
import { WonderlandError } from './errors'

import type { WonderWorkKind } from './domain'

export type WonderWorkModerationAction = 'delete' | 'hide' | 'restore'

export function normalizeExternalWorkUrl(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length > 2_048)
    throw new WonderlandError(`${label}无效`, 400, 'WORK_URL_INVALID')
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (url.protocol !== 'https:' || url.username || url.password || !hostname)
      throw new Error('invalid url')
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local'))
      throw new Error('local host')
    if (isIP(hostname) && !isPublicIpAddress(hostname))
      throw new Error('private address')
    url.hash = ''
    return url.toString()
  }
  catch {
    throw new WonderlandError(`${label}必须是可公开访问的 HTTPS 外链`, 400, 'WORK_URL_INVALID')
  }
}

export function sanitizeWorkInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WonderlandError('作品资料格式无效', 400, 'WORK_INPUT_INVALID')
  const input = value as Record<string, unknown>
  const title = readText(input.title, 2, 100, '作品名称')
  const summary = readText(input.summary, 20, 240, '作品简介')
  const kind = readKind(input.kind)
  const tags = readTags(input.tags)
  const sourceUrl = normalizeExternalWorkUrl(input.sourceUrl, '作品地址')
  const demoUrl = input.demoUrl ? normalizeExternalWorkUrl(input.demoUrl, '演示地址') : null
  const coverFileId = typeof input.coverFileId === 'string' ? input.coverFileId : ''
  if (!isUuid(coverFileId))
    throw new WonderlandError('请上传作品封面', 400, 'WORK_COVER_REQUIRED')
  const content = normalizeWonderlandDocument(input.content, {
    maxImages: 8,
    maxTextLength: 30_000,
    minTextLength: 30,
  })
  return { content, coverFileId, demoUrl, kind, sourceUrl, summary, tags, title }
}

/**
 * Keep moderation state changes explicit so the API and UI agree on the
 * reversible soft-delete contract. A deleted work can be restored by admins.
 */
export function workModerationTransition(action: WonderWorkModerationAction, _visibility: 'deleted' | 'hidden' | 'visible') {
  if (action === 'delete')
    return { deletedAt: 'now' as const, nextVisibility: 'deleted' as const }
  if (action === 'hide' && _visibility !== 'deleted')
    return { deletedAt: null, nextVisibility: 'hidden' as const }
  if (action === 'hide')
    return { deletedAt: 'now' as const, nextVisibility: 'deleted' as const }
  return { deletedAt: null, nextVisibility: 'visible' as const }
}

function readKind(value: unknown): WonderWorkKind {
  if (!WONDER_WORK_KINDS.includes(value as WonderWorkKind))
    throw new WonderlandError('请选择作品类型', 400, 'WORK_KIND_INVALID')
  return value as WonderWorkKind
}

function readTags(value: unknown) {
  if (!Array.isArray(value))
    throw new WonderlandError('作品标签格式无效', 400, 'WORK_TAGS_INVALID')
  const tags = value.map(tag => typeof tag === 'string' ? tag.trim() : '')
    .filter(Boolean)
  const unique = [...new Set(tags)]
  if (unique.length > 8 || unique.some(tag => tag.length > 24))
    throw new WonderlandError('作品标签最多 8 个，每个不超过 24 个字符', 400, 'WORK_TAGS_INVALID')
  return unique
}

function readText(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'string')
    throw new WonderlandError(`${label}格式无效`, 400, 'WORK_INPUT_INVALID')
  const result = value.trim()
  if (result.length < min || result.length > max)
    throw new WonderlandError(`${label}需要 ${min}–${max} 个字符`, 400, 'WORK_INPUT_INVALID')
  return result
}

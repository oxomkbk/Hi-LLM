import { randomBytes } from 'node:crypto'

import { inspectMarkdownImages, markdownPlainText } from '../content/markdown'
import { isUuid, stripControlCharacters } from '../security'
import { normalizeWonderlandDocument } from './content'
import { WonderlandError } from './errors'

import type { WonderNewsStatus, WonderReportReason } from './domain'

export function createWonderSlug(title: string, prefix = 'question') {
  const ascii = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56)
  const base = ascii || prefix
  return `${base}-${randomBytes(5).toString('hex')}`
}

export function parseIdempotencyKey(value: string | null) {
  if (!isUuid(value))
    throw new WonderlandError('缺少有效的幂等请求编号', 400, 'IDEMPOTENCY_KEY_INVALID')
  return value
}

export function sanitizeAnswerInput(input: Record<string, unknown>) {
  return {
    content: normalizeWonderlandDocument(input.content, { maxImages: 8, maxTextLength: 30000, minTextLength: 2 }),
  }
}

export function sanitizeCategoryInput(input: Record<string, unknown>) {
  const scope = input.scope === 'news' ? 'news' : input.scope === 'question' ? 'question' : null
  if (!scope)
    throw new WonderlandError('分类用途无效', 400, 'CATEGORY_SCOPE_INVALID')
  const parentId = input.parentId === null || input.parentId === undefined || input.parentId === ''
    ? null
    : requireUuid(input.parentId, '上级分类')
  if (scope === 'news' && parentId)
    throw new WonderlandError('新闻分类不支持二级分类', 400, 'NEWS_CATEGORY_DEPTH_INVALID')
  return {
    description: readString(input.description, { field: '分类说明', max: 300, min: 0 }),
    icon: readString(input.icon, { field: '分类图标', max: 80, min: 0 }) || null,
    isActive: input.isActive !== false,
    name: readString(input.name, { field: '分类名称', max: 40, min: 1 }),
    parentId,
    scope,
    slug: readSlug(input.slug, '分类地址'),
    sort: readInteger(input.sort, 1, 99, 1),
  }
}

export function sanitizeCommentInput(input: Record<string, unknown>) {
  const body = readString(input.body, { field: '评论', max: 2000, min: 0 })
  const images = inspectMarkdownImages(body)
  if (images.externalImages)
    throw new WonderlandError('评论图片必须先上传到本站，外部图片可改为普通链接', 400, 'COMMENT_EXTERNAL_IMAGE')
  if (images.fileIds.length > 4)
    throw new WonderlandError('每条评论最多上传 4 张图片', 400, 'COMMENT_IMAGE_LIMIT')
  if (new Set(images.fileIds).size !== images.fileIds.length)
    throw new WonderlandError('同一张图片不能在评论中重复插入', 400, 'COMMENT_IMAGE_DUPLICATE')
  if (markdownPlainText(body).length < 2 && !images.fileIds.length)
    throw new WonderlandError('评论不能少于 2 个字符', 400, 'COMMENT_TOO_SHORT')
  return {
    body,
    fileIds: images.fileIds,
    parentId: input.parentId === null || input.parentId === undefined || input.parentId === ''
      ? null
      : requireUuid(input.parentId, '回复评论'),
  }
}

export function sanitizeNewsInput(input: Record<string, unknown>) {
  const allowedStatuses = new Set<WonderNewsStatus>(['archived', 'draft', 'published', 'scheduled'])
  const status = typeof input.status === 'string' && allowedStatuses.has(input.status as WonderNewsStatus)
    ? input.status as WonderNewsStatus
    : 'draft'
  const scheduledAt = readOptionalDate(input.scheduledAt)
  if (status === 'scheduled' && (!scheduledAt || scheduledAt.getTime() <= Date.now()))
    throw new WonderlandError('定时发布时间必须晚于当前时间', 400, 'NEWS_SCHEDULE_INVALID')

  // 草稿是写作过程中的恢复点，不应套用发布门槛。数据库仍保存完整的
  // Wonderland 文档结构；只有标题、摘要和正文长度在草稿阶段放宽。
  const isDraft = status === 'draft'

  return {
    categoryId: requireUuid(input.categoryId, '新闻分类'),
    content: normalizeWonderlandDocument(input.content, { maxImages: 20, maxTextLength: 50000, minTextLength: isDraft ? 0 : 30 }),
    coverFileId: input.coverFileId ? requireUuid(input.coverFileId, '新闻封面') : null,
    featured: input.featured === true,
    pinned: input.pinned === true,
    scheduledAt,
    seoDescription: readString(input.seoDescription, { field: 'SEO 描述', max: 160, min: 0 }) || null,
    seoTitle: readString(input.seoTitle, { field: 'SEO 标题', max: 70, min: 0 }) || null,
    sort: readInteger(input.sort, 1, 99, 1),
    status,
    summary: readString(input.summary, { field: '新闻摘要', max: 300, min: isDraft ? 0 : 20 }),
    title: readString(input.title, { field: '新闻标题', max: 160, min: isDraft ? 0 : 4 }),
  }
}

export function sanitizeQuestionInput(input: Record<string, unknown>) {
  const categoryId = requireUuid(input.categoryId, '问题分类')
  const tagIds = normalizeUuidList(input.tagIds, 5, '问题标签')
  const title = readString(input.title, { field: '问题标题', max: 160, min: 8 })
  const summary = readString(input.summary, { field: '问题摘要', max: 300, min: 20 })
  const content = normalizeWonderlandDocument(input.content, { maxImages: 8, maxTextLength: 30000, minTextLength: 30 })
  return { categoryId, content, summary, tagIds, title }
}

export function sanitizeReportInput(input: Record<string, unknown>) {
  const targetEntries = ['questionId', 'answerId', 'commentId']
    .map(key => [key, input[key]] as const)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (targetEntries.length !== 1)
    throw new WonderlandError('请选择一个要举报的内容', 400, 'REPORT_TARGET_INVALID')

  const [targetKey, targetValue] = targetEntries[0]!
  const allowedReasons = new Set<WonderReportReason>(['spam', 'abuse', 'illegal', 'misinformation', 'privacy', 'other'])
  if (typeof input.reason !== 'string' || !allowedReasons.has(input.reason as WonderReportReason))
    throw new WonderlandError('举报原因无效', 400, 'REPORT_REASON_INVALID')

  return {
    details: readString(input.details, { field: '补充说明', max: 1000, min: 0 }),
    reason: input.reason as WonderReportReason,
    targetId: requireUuid(targetValue, '举报内容'),
    targetType: targetKey.replace('Id', '') as 'answer' | 'comment' | 'question',
  }
}

function normalizeUuidList(input: unknown, max: number, field: string) {
  if (!Array.isArray(input))
    return []
  const result = [...new Set(input)]
  if (result.length > max || result.some(value => !isUuid(value)))
    throw new WonderlandError(`${field}无效或超过 ${max} 个`, 400, 'UUID_LIST_INVALID')
  return result as string[]
}

function readInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function readOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === '')
    return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime()))
    throw new WonderlandError('日期格式无效', 400, 'DATE_INVALID')
  return date
}

function readSlug(value: unknown, field: string) {
  const result = readString(value, { field, max: 80, min: 1 }).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result))
    throw new WonderlandError(`${field}只能包含小写字母、数字和连字符`, 400, 'SLUG_INVALID')
  return result
}

function readString(value: unknown, options: { field: string, max: number, min: number }) {
  const result = typeof value === 'string' ? stripControlCharacters(value).trim() : ''
  if (result.length < options.min)
    throw new WonderlandError(`${options.field}不能少于 ${options.min} 个字符`, 400, 'TEXT_TOO_SHORT')
  if (result.length > options.max)
    throw new WonderlandError(`${options.field}不能超过 ${options.max} 个字符`, 400, 'TEXT_TOO_LONG')
  return result
}

function requireUuid(value: unknown, field: string) {
  if (!isUuid(value))
    throw new WonderlandError(`${field}无效`, 400, 'UUID_INVALID')
  return value
}

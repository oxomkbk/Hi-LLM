import { isUuid } from '../uuid'
import { WonderlandError } from './errors'

export type WonderlandBlock
  = | WonderlandBlockquote
    | WonderlandCodeBlock
    | WonderlandHeading
    | WonderlandHorizontalRule
    | WonderlandImage
    | WonderlandList
    | WonderlandParagraph
    | WonderlandTable
    | WonderlandTaskList

export interface WonderlandBlockquote {
  content: WonderlandBlock[]
  type: 'blockquote'
}

export interface WonderlandCodeBlock {
  code: string
  language?: string
  type: 'codeBlock'
}

export interface WonderlandDocument {
  content: WonderlandBlock[]
  schema: 'wonderland-document'
  version: 1
}

export interface WonderlandHeading {
  align?: WonderlandTextAlignment
  content: WonderlandInline[]
  level: 2 | 3 | 4
  type: 'heading'
}

export interface WonderlandHorizontalRule {
  type: 'horizontalRule'
}

export interface WonderlandImage {
  alt: string
  caption: string
  fileId: string
  type: 'image'
}

export type WonderlandInline = WonderlandText

export interface WonderlandList {
  content: WonderlandListItem[]
  type: 'bulletList' | 'orderedList'
}

export interface WonderlandListItem {
  content: WonderlandBlock[]
  type: 'listItem'
}

export interface WonderlandParagraph {
  align?: WonderlandTextAlignment
  content: WonderlandInline[]
  type: 'paragraph'
}

export interface WonderlandTable {
  rows: WonderlandTableRow[]
  type: 'table'
}

export interface WonderlandTableCell {
  colspan?: number
  content: WonderlandBlock[]
  rowspan?: number
  type: 'tableCell' | 'tableHeader'
}

export interface WonderlandTableRow {
  cells: WonderlandTableCell[]
  type: 'tableRow'
}

export interface WonderlandTaskItem {
  checked: boolean
  content: WonderlandBlock[]
  type: 'taskItem'
}

export interface WonderlandTaskList {
  content: WonderlandTaskItem[]
  type: 'taskList'
}

export interface WonderlandText {
  marks?: WonderlandTextMark[]
  text: string
  type: 'text'
}

export type WonderlandTextAlignment = 'center' | 'left' | 'right'

export const WONDERLAND_TEXT_COLORS = ['accent', 'red', 'blue', 'green', 'muted'] as const
export const WONDERLAND_BACKGROUND_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export const WONDERLAND_TEXT_SIZES = ['small', 'large', 'xlarge'] as const
export const WONDERLAND_CODE_LANGUAGES = [
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'plaintext',
  'python',
  'sql',
  'tsx',
  'typescript',
  'xml',
  'yaml',
] as const

export type WonderlandBackgroundColor = (typeof WONDERLAND_BACKGROUND_COLORS)[number]
export type WonderlandTextColor = (typeof WONDERLAND_TEXT_COLORS)[number]
export type WonderlandTextMark
  = | { type: 'bold' | 'code' | 'highlight' | 'italic' | 'strike' | 'underline' }
    | { color: WonderlandTextColor, type: 'color' }
    | { color: WonderlandBackgroundColor, type: 'backgroundColor' }
    | { href: string, type: 'link' }
    | { size: WonderlandTextSize, type: 'textSize' }

export type WonderlandTextSize = (typeof WONDERLAND_TEXT_SIZES)[number]

interface NormalizeOptions {
  maxImages?: number
  maxTextLength?: number
  minTextLength?: number
}

interface NormalizeState {
  fileIds: string[]
  maxImages: number
  nodeCount: number
  textParts: string[]
}

const MAX_DEPTH = 8
const MAX_NODES = 2000
const MAX_TEXT_NODE_LENGTH = 10000
const SUPPORTED_COLORS = new Set<string>(WONDERLAND_TEXT_COLORS)
const SUPPORTED_BACKGROUND_COLORS = new Set<string>(WONDERLAND_BACKGROUND_COLORS)
const SUPPORTED_LANGUAGES = new Set<string>(WONDERLAND_CODE_LANGUAGES)
const SUPPORTED_TEXT_SIZES = new Set<string>(WONDERLAND_TEXT_SIZES)

export function normalizeWonderlandDocument(input: unknown, options: NormalizeOptions = {}) {
  if (!isRecord(input) || input.schema !== 'wonderland-document' || input.version !== 1 || !Array.isArray(input.content))
    throw new WonderlandError('正文格式无效', 400, 'CONTENT_SCHEMA_INVALID')

  const state: NormalizeState = {
    fileIds: [],
    maxImages: options.maxImages ?? 8,
    nodeCount: 0,
    textParts: [],
  }
  const content = input.content.map(node => normalizeBlock(node, state, 1))
  const text = state.textParts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const minLength = options.minTextLength ?? 2
  const maxLength = options.maxTextLength ?? 30000

  if (text.length < minLength)
    throw new WonderlandError(`正文不能少于 ${minLength} 个字符`, 400, 'CONTENT_TOO_SHORT')
  if (text.length > maxLength)
    throw new WonderlandError(`正文不能超过 ${maxLength} 个字符`, 400, 'CONTENT_TOO_LONG')

  return {
    document: { content, schema: 'wonderland-document', version: 1 } satisfies WonderlandDocument,
    fileIds: state.fileIds,
    text,
  }
}

export function plainTextDocument(text: string): WonderlandDocument {
  return {
    content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
    schema: 'wonderland-document',
    version: 1,
  }
}

export function wonderlandDocumentText(document: WonderlandDocument) {
  const blockText = (block: WonderlandBlock): string => {
    if (block.type === 'paragraph' || block.type === 'heading')
      return block.content.map(item => item.text).join('')
    if (block.type === 'blockquote')
      return block.content.map(blockText).join('\n')
    if (block.type === 'bulletList' || block.type === 'orderedList')
      return block.content.flatMap(item => item.content).map(blockText).join('\n')
    if (block.type === 'taskList')
      return block.content.flatMap(item => item.content).map(blockText).join('\n')
    if (block.type === 'table')
      return block.rows.flatMap(row => row.cells).flatMap(cell => cell.content).map(blockText).join('\n')
    if (block.type === 'codeBlock')
      return block.code
    return ''
  }
  return document.content.map(blockText).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function countNode(state: NormalizeState, depth: number) {
  state.nodeCount += 1
  if (depth > MAX_DEPTH || state.nodeCount > MAX_NODES)
    throw new WonderlandError('正文结构过于复杂', 400, 'CONTENT_COMPLEXITY_LIMIT')
}

function invalidNode() {
  return new WonderlandError('正文包含不支持的内容', 400, 'CONTENT_NODE_INVALID')
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAlignment(value: unknown): WonderlandTextAlignment | undefined {
  return value === 'center' || value === 'right' ? value : undefined
}

function normalizeBlock(input: unknown, state: NormalizeState, depth: number): WonderlandBlock {
  countNode(state, depth)
  if (!isRecord(input) || typeof input.type !== 'string')
    throw invalidNode()

  if (input.type === 'paragraph') {
    return {
      ...(normalizeAlignment(input.align) ? { align: normalizeAlignment(input.align) } : {}),
      content: normalizeInlineContent(input.content, state, depth + 1),
      type: 'paragraph',
    }
  }

  if (input.type === 'heading') {
    if (input.level !== 2 && input.level !== 3 && input.level !== 4)
      throw invalidNode()
    return {
      ...(normalizeAlignment(input.align) ? { align: normalizeAlignment(input.align) } : {}),
      content: normalizeInlineContent(input.content, state, depth + 1),
      level: input.level,
      type: 'heading',
    }
  }

  if (input.type === 'blockquote') {
    if (!Array.isArray(input.content) || !input.content.length)
      throw invalidNode()
    return {
      content: input.content.map(child => normalizeBlock(child, state, depth + 1)),
      type: 'blockquote',
    }
  }

  if (input.type === 'bulletList' || input.type === 'orderedList') {
    if (!Array.isArray(input.content) || !input.content.length)
      throw invalidNode()
    return {
      content: input.content.map(child => normalizeListItem(child, state, depth + 1)),
      type: input.type,
    }
  }

  if (input.type === 'taskList') {
    if (!Array.isArray(input.content) || !input.content.length)
      throw invalidNode()
    return {
      content: input.content.map(child => normalizeTaskItem(child, state, depth + 1)),
      type: 'taskList',
    }
  }

  if (input.type === 'table') {
    if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 30)
      throw invalidNode()
    return {
      rows: input.rows.map(row => normalizeTableRow(row, state, depth + 1)),
      type: 'table',
    }
  }

  if (input.type === 'codeBlock') {
    const code = readText(input.code, MAX_TEXT_NODE_LENGTH)
    const language = typeof input.language === 'string' && SUPPORTED_LANGUAGES.has(input.language)
      ? input.language
      : undefined
    state.textParts.push(code)
    return { code, ...(language ? { language } : {}), type: 'codeBlock' }
  }

  if (input.type === 'horizontalRule')
    return { type: 'horizontalRule' }

  if (input.type === 'image') {
    if (!isUuid(input.fileId))
      throw new WonderlandError('正文包含无效图片', 400, 'CONTENT_IMAGE_INVALID')
    if (state.fileIds.includes(input.fileId))
      throw new WonderlandError('同一张图片不能重复插入正文', 400, 'CONTENT_IMAGE_DUPLICATE')
    if (state.fileIds.length >= state.maxImages)
      throw new WonderlandError(`正文最多插入 ${state.maxImages} 张图片`, 400, 'CONTENT_IMAGE_LIMIT')
    state.fileIds.push(input.fileId)
    return {
      alt: readText(input.alt, 180),
      caption: readText(input.caption, 300),
      fileId: input.fileId,
      type: 'image',
    }
  }

  throw invalidNode()
}

function normalizeInlineContent(input: unknown, state: NormalizeState, depth: number) {
  if (!Array.isArray(input))
    throw invalidNode()
  return input.map((node) => {
    countNode(state, depth)
    if (!isRecord(node) || node.type !== 'text')
      throw invalidNode()
    const text = readText(node.text, MAX_TEXT_NODE_LENGTH)
    const marks = normalizeMarks(node.marks)
    state.textParts.push(text)
    return { ...(marks.length ? { marks } : {}), text, type: 'text' } satisfies WonderlandText
  })
}

function normalizeLink(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new WonderlandError('正文链接无效', 400, 'CONTENT_LINK_INVALID')
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('unsupported protocol')
    return url.toString()
  }
  catch {
    throw new WonderlandError('正文链接无效', 400, 'CONTENT_LINK_INVALID')
  }
}

function normalizeListItem(input: unknown, state: NormalizeState, depth: number): WonderlandListItem {
  countNode(state, depth)
  if (!isRecord(input) || input.type !== 'listItem' || !Array.isArray(input.content) || !input.content.length)
    throw invalidNode()
  return {
    content: input.content.map(child => normalizeBlock(child, state, depth + 1)),
    type: 'listItem',
  }
}

function normalizeMarks(input: unknown): WonderlandTextMark[] {
  if (input === undefined)
    return []
  if (!Array.isArray(input) || input.length > 6)
    throw invalidNode()

  const seen = new Set<string>()
  return input.map((mark) => {
    if (!isRecord(mark) || typeof mark.type !== 'string' || seen.has(mark.type))
      throw invalidNode()
    seen.add(mark.type)
    if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'code' || mark.type === 'underline' || mark.type === 'strike' || mark.type === 'highlight')
      return { type: mark.type }
    if (mark.type === 'link')
      return { href: normalizeLink(mark.href), type: 'link' }
    if (mark.type === 'color' && SUPPORTED_COLORS.has(mark.color))
      return { color: mark.color as WonderlandTextColor, type: 'color' }
    if (mark.type === 'backgroundColor' && SUPPORTED_BACKGROUND_COLORS.has(mark.color))
      return { color: mark.color as WonderlandBackgroundColor, type: 'backgroundColor' }
    if (mark.type === 'textSize' && SUPPORTED_TEXT_SIZES.has(mark.size))
      return { size: mark.size as WonderlandTextSize, type: 'textSize' }
    throw invalidNode()
  })
}

function normalizeSpan(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12 ? value : 1
}

function normalizeTableCell(input: unknown, state: NormalizeState, depth: number): WonderlandTableCell {
  countNode(state, depth)
  if (!isRecord(input) || (input.type !== 'tableCell' && input.type !== 'tableHeader') || !Array.isArray(input.content) || !input.content.length)
    throw invalidNode()
  const colspan = normalizeSpan(input.colspan)
  const rowspan = normalizeSpan(input.rowspan)
  return {
    ...(colspan > 1 ? { colspan } : {}),
    content: input.content.map(child => normalizeBlock(child, state, depth + 1)),
    ...(rowspan > 1 ? { rowspan } : {}),
    type: input.type,
  }
}

function normalizeTableRow(input: unknown, state: NormalizeState, depth: number): WonderlandTableRow {
  countNode(state, depth)
  if (!isRecord(input) || input.type !== 'tableRow' || !Array.isArray(input.cells) || !input.cells.length || input.cells.length > 12)
    throw invalidNode()
  return {
    cells: input.cells.map(cell => normalizeTableCell(cell, state, depth + 1)),
    type: 'tableRow',
  }
}

function normalizeTaskItem(input: unknown, state: NormalizeState, depth: number): WonderlandTaskItem {
  countNode(state, depth)
  if (!isRecord(input) || input.type !== 'taskItem' || typeof input.checked !== 'boolean' || !Array.isArray(input.content) || !input.content.length)
    throw invalidNode()
  return {
    checked: input.checked,
    content: input.content.map(child => normalizeBlock(child, state, depth + 1)),
    type: 'taskItem',
  }
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== 'string')
    throw invalidNode()
  const result = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code === 9 || code === 10 || (code >= 32 && code !== 127)
    })
    .join('')
  if (result.length > maxLength)
    throw new WonderlandError('正文单个内容块过长', 400, 'CONTENT_NODE_TOO_LONG')
  return result
}

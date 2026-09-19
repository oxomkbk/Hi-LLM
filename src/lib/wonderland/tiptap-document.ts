import type {
  WonderlandBackgroundColor,
  WonderlandBlock,
  WonderlandDocument,
  WonderlandInline,
  WonderlandTableCell,
  WonderlandTextColor,
  WonderlandTextMark,
  WonderlandTextSize,
} from './content'
import type { JSONContent } from '@tiptap/react'

const FILE_SOURCE = /^\/api\/files\/([0-9a-f-]{36})$/i

export const TIPTAP_TEXT_COLORS = {
  accent: '#ef5b2a',
  blue: '#2563eb',
  green: '#137a5e',
  muted: '#746e65',
  red: '#c83c3c',
} as const

export const TIPTAP_BACKGROUND_COLORS = {
  blue: '#bfdbfe',
  green: '#bbf7d0',
  pink: '#fbcfe8',
  purple: '#ddd6fe',
  yellow: '#fef08a',
} as const

export const TIPTAP_TEXT_SIZES = {
  large: '1.125rem',
  small: '0.875rem',
  xlarge: '1.375rem',
} as const

const COLOR_TOKEN_BY_VALUE = new Map<string, WonderlandTextColor>(Object.entries(TIPTAP_TEXT_COLORS).map(([token, value]) => [value, token as WonderlandTextColor]))
const BACKGROUND_COLOR_TOKEN_BY_VALUE = new Map<string, WonderlandBackgroundColor>(Object.entries(TIPTAP_BACKGROUND_COLORS).map(([token, value]) => [value, token as WonderlandBackgroundColor]))
const SIZE_TOKEN_BY_VALUE = new Map<string, WonderlandTextSize>(Object.entries(TIPTAP_TEXT_SIZES).map(([token, value]) => [value, token as WonderlandTextSize]))

export function tiptapToWonderlandDocument(document: JSONContent): WonderlandDocument {
  return {
    content: (document.content ?? []).flatMap(blockFromTiptap),
    schema: 'wonderland-document',
    version: 1,
  }
}

export function wonderlandToTiptapDocument(document?: WonderlandDocument): JSONContent {
  return {
    content: document?.content.map(blockToTiptap) ?? [{ type: 'paragraph' }],
    type: 'doc',
  }
}

function blockFromTiptap(node: JSONContent): WonderlandBlock[] {
  if (node.type === 'paragraph') {
    const align = textAlignment(node.attrs?.textAlign)
    return [{ ...(align ? { align } : {}), content: inlineFromTiptap(node.content), type: 'paragraph' }]
  }

  if (node.type === 'heading') {
    const level = node.attrs?.level
    if (level === 2 || level === 3 || level === 4)
      return [{ ...(textAlignment(node.attrs?.textAlign) ? { align: textAlignment(node.attrs?.textAlign) } : {}), content: inlineFromTiptap(node.content), level, type: 'heading' }]
    if (level === 1)
      return [{ content: inlineFromTiptap(node.content), level: 2, type: 'heading' }]
    return [{ content: inlineFromTiptap(node.content), type: 'paragraph' }]
  }

  if (node.type === 'blockquote') {
    const content = (node.content ?? []).flatMap(blockFromTiptap)
    return content.length ? [{ content, type: 'blockquote' }] : []
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const content = (node.content ?? []).flatMap((item) => {
      if (item.type !== 'listItem')
        return []
      const itemContent = (item.content ?? []).flatMap(blockFromTiptap)
      return itemContent.length ? [{ content: itemContent, type: 'listItem' as const }] : []
    })
    return content.length ? [{ content, type: node.type }] : []
  }

  if (node.type === 'taskList') {
    const content = (node.content ?? []).flatMap((item) => {
      if (item.type !== 'taskItem')
        return []
      const itemContent = (item.content ?? []).flatMap(blockFromTiptap)
      return itemContent.length
        ? [{ checked: Boolean(item.attrs?.checked), content: itemContent, type: 'taskItem' as const }]
        : []
    })
    return content.length ? [{ content, type: 'taskList' }] : []
  }

  if (node.type === 'table') {
    const rows = (node.content ?? []).flatMap((row) => {
      if (row.type !== 'tableRow')
        return []
      const cells = (row.content ?? []).flatMap((cell) => {
        if (cell.type !== 'tableCell' && cell.type !== 'tableHeader')
          return []
        const content = (cell.content ?? []).flatMap(blockFromTiptap)
        if (!content.length)
          content.push({ content: [], type: 'paragraph' })
        const colspan = numericSpan(cell.attrs?.colspan)
        const rowspan = numericSpan(cell.attrs?.rowspan)
        const tableCell: WonderlandTableCell = {
          ...(colspan > 1 ? { colspan } : {}),
          content,
          ...(rowspan > 1 ? { rowspan } : {}),
          type: cell.type,
        }
        return [tableCell]
      })
      return cells.length ? [{ cells, type: 'tableRow' as const }] : []
    })
    return rows.length ? [{ rows, type: 'table' }] : []
  }

  if (node.type === 'codeBlock') {
    return [{
      code: textContent(node),
      ...(typeof node.attrs?.language === 'string' ? { language: node.attrs.language } : {}),
      type: 'codeBlock',
    }]
  }

  if (node.type === 'horizontalRule')
    return [{ type: 'horizontalRule' }]

  if (node.type === 'image') {
    const source = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    const fileId = FILE_SOURCE.exec(source)?.[1]
    if (!fileId)
      return []
    return [{
      alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '',
      caption: typeof node.attrs?.title === 'string' ? node.attrs.title : '',
      fileId,
      type: 'image',
    }]
  }

  return (node.content ?? []).flatMap(blockFromTiptap)
}

function blockToTiptap(block: WonderlandBlock): JSONContent {
  if (block.type === 'paragraph')
    return { ...(block.align ? { attrs: { textAlign: block.align } } : {}), content: inlineToTiptap(block.content), type: 'paragraph' }
  if (block.type === 'heading')
    return { attrs: { level: block.level, ...(block.align ? { textAlign: block.align } : {}) }, content: inlineToTiptap(block.content), type: 'heading' }
  if (block.type === 'blockquote')
    return { content: block.content.map(blockToTiptap), type: 'blockquote' }
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    return {
      content: block.content.map(item => ({ content: item.content.map(blockToTiptap), type: 'listItem' })),
      type: block.type,
    }
  }
  if (block.type === 'taskList') {
    return {
      content: block.content.map(item => ({
        attrs: { checked: item.checked },
        content: item.content.map(blockToTiptap),
        type: 'taskItem',
      })),
      type: 'taskList',
    }
  }
  if (block.type === 'table') {
    return {
      content: block.rows.map(row => ({
        content: row.cells.map(cell => ({
          attrs: { colspan: cell.colspan ?? 1, rowspan: cell.rowspan ?? 1 },
          content: cell.content.map(blockToTiptap),
          type: cell.type,
        })),
        type: 'tableRow',
      })),
      type: 'table',
    }
  }
  if (block.type === 'codeBlock') {
    return {
      attrs: { language: block.language ?? null },
      ...(block.code ? { content: [{ text: block.code, type: 'text' }] } : {}),
      type: 'codeBlock',
    }
  }
  if (block.type === 'horizontalRule')
    return { type: 'horizontalRule' }
  if (block.type === 'image') {
    return {
      attrs: {
        alt: block.alt,
        src: `/api/files/${block.fileId}`,
        title: block.caption,
      },
      type: 'image',
    }
  }
  throw new Error('不支持的妙妙屋内容节点')
}

function inlineFromTiptap(nodes?: JSONContent[]): WonderlandInline[] {
  return (nodes ?? []).flatMap((node) => {
    if (node.type === 'hardBreak')
      return [{ text: '\n', type: 'text' as const }]
    if (node.type !== 'text' || typeof node.text !== 'string')
      return []
    const marks = (node.marks ?? []).flatMap(markFromTiptap)
    return [{ ...(marks.length ? { marks } : {}), text: node.text, type: 'text' as const }]
  })
}

function inlineToTiptap(nodes: WonderlandInline[]): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    const result: JSONContent[] = []
    const parts = node.text.split('\n')
    parts.forEach((text, index) => {
      if (index)
        result.push({ type: 'hardBreak' })
      if (text) {
        result.push({
          ...(node.marks?.length ? { marks: marksToTiptap(node.marks) } : {}),
          text,
          type: 'text',
        })
      }
    })
    return result
  })
}

function markFromTiptap(mark: JSONContent): WonderlandTextMark[] {
  if (mark.type === 'highlight')
    return [{ type: 'highlight' }]
  if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'code' || mark.type === 'underline' || mark.type === 'strike')
    return [{ type: mark.type }]
  if (mark.type === 'link' && typeof mark.attrs?.href === 'string')
    return [{ href: mark.attrs.href, type: 'link' }]
  if (mark.type === 'textStyle') {
    const color = typeof mark.attrs?.color === 'string' ? COLOR_TOKEN_BY_VALUE.get(mark.attrs.color.toLowerCase()) : undefined
    const backgroundColor = typeof mark.attrs?.backgroundColor === 'string' ? BACKGROUND_COLOR_TOKEN_BY_VALUE.get(mark.attrs.backgroundColor.toLowerCase()) : undefined
    const size = typeof mark.attrs?.fontSize === 'string' ? SIZE_TOKEN_BY_VALUE.get(mark.attrs.fontSize.toLowerCase()) : undefined
    return [
      ...(color ? [{ color, type: 'color' as const }] : []),
      ...(backgroundColor ? [{ color: backgroundColor, type: 'backgroundColor' as const }] : []),
      ...(size ? [{ size, type: 'textSize' as const }] : []),
    ]
  }
  return []
}

function marksToTiptap(marks: WonderlandTextMark[]) {
  const result: NonNullable<JSONContent['marks']> = []
  const textStyle: Record<string, string> = {}
  for (const mark of marks) {
    if (mark.type === 'link')
      result.push({ attrs: { href: mark.href, rel: 'noopener noreferrer nofollow', target: '_blank' }, type: 'link' })
    else if (mark.type === 'color')
      textStyle.color = TIPTAP_TEXT_COLORS[mark.color]
    else if (mark.type === 'textSize')
      textStyle.fontSize = TIPTAP_TEXT_SIZES[mark.size]
    else if (mark.type === 'backgroundColor')
      textStyle.backgroundColor = TIPTAP_BACKGROUND_COLORS[mark.color]
    else
      result.push({ type: mark.type })
  }
  if (Object.keys(textStyle).length)
    result.push({ attrs: textStyle, type: 'textStyle' })
  return result
}

function numericSpan(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12 ? value : 1
}

function textAlignment(value: unknown) {
  return value === 'center' || value === 'right' ? value : undefined
}

function textContent(node: JSONContent): string {
  if (typeof node.text === 'string')
    return node.text
  return (node.content ?? []).map(textContent).join('')
}

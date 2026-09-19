import 'server-only'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'
import sanitizeHtml from 'sanitize-html'

import { parsePromptGlossaryContent, PROMPT_GLOSSARY_LANGUAGE } from './glossary'
import {
  isGlossaryPreviewDocument,
  isGlossaryPreviewStyleDocument,
  PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION,
} from './glossary-preview'

import type { PromptGlossaryDocument } from './glossary'
import type {
  PromptGlossaryPreviewBundle,
  PromptGlossaryPreviewDocument,
} from './glossary-preview'
import type { PromptDocument, PromptDocumentInput, PromptStatus } from '@/types'

const MAX_HTML_BYTES = 8 * 1024
const MAX_JSON_BYTES = 560 * 1024
const MAX_STYLE_BYTES = 32 * 1024
const MAX_STYLE_DECLARATIONS = 900
const MAX_STYLE_RULES = 192
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CLASS_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const DATA_VALUE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FORBIDDEN_SOURCE_PATTERN = /vibe.?hub|\boil\b|oiloil\.org|https?:\/\/|www\.|(?:data|javascript|vbscript):/iu
const FORBIDDEN_RAW_PATTERN = /<!--|-->|<\/?(?:a|audio|base|button|canvas|embed|form|iframe|img|input|link|meta|object|script|select|style|svg|textarea|video)\b|\son[a-z]+\s*=|\s(?:href|src|srcdoc|action|formaction|poster|style|id)\s*=/iu
const ALLOWED_TAGS = ['b', 'div', 'em', 'li', 'ol', 'p', 'small', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']
const ALLOWED_COLOR_TOKENS = new Set([
  '--preview-accent',
  '--preview-accent-soft',
  '--preview-blue',
  '--preview-bg',
  '--preview-border',
  '--preview-clay',
  '--preview-cyan',
  '--preview-dark-bg',
  '--preview-dark-surface',
  '--preview-dark-text',
  '--preview-danger',
  '--preview-earth',
  '--preview-gold',
  '--preview-ink',
  '--preview-muted',
  '--preview-paper',
  '--preview-pink',
  '--preview-purple',
  '--preview-red',
  '--preview-sand',
  '--preview-shadow',
  '--preview-success',
  '--preview-surface',
  '--preview-terminal',
  '--preview-text',
  '--preview-warning',
  '--preview-yellow',
])
const LENGTH_PROPERTIES = new Set([
  'border-radius',
  'border-width',
  'bottom',
  'column-gap',
  'font-size',
  'gap',
  'height',
  'left',
  'letter-spacing',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'right',
  'row-gap',
  'top',
  'width',
])
const COLOR_PROPERTIES = new Set(['background-color', 'border-color', 'color'])
const ALLOWED_PROPERTIES = new Set([
  ...LENGTH_PROPERTIES,
  ...COLOR_PROPERTIES,
  'align-content',
  'align-items',
  'align-self',
  'aspect-ratio',
  'border',
  'border-bottom',
  'border-left',
  'border-right',
  'border-style',
  'border-top',
  'box-shadow',
  'box-sizing',
  'display',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'font-family',
  'font-style',
  'font-weight',
  'grid-column',
  'grid-row',
  'grid-template-columns',
  'grid-template-rows',
  'justify-content',
  'justify-items',
  'justify-self',
  'line-height',
  'list-style',
  'order',
  'overflow',
  'overflow-x',
  'overflow-y',
  'text-align',
  'text-decoration',
  'text-overflow',
  'text-transform',
  'transform',
  'transform-origin',
  'white-space',
  'word-break',
])
const SAFE_KEYWORD_VALUE = /^(?:auto|baseline|block|bold|border-box|break-word|center|column|dashed|ellipsis|end|flex|flex-end|flex-start|grid|hidden|inherit|inline-block|inline-flex|italic|left|line-through|lowercase|none|normal|nowrap|pre|pre-wrap|right|row|solid|space-around|space-between|space-evenly|start|stretch|underline|uppercase|visible|wrap|\d+(?:\.\d+)?(?:fr)?)(?:\s+(?:auto|center|end|flex-end|flex-start|left|none|normal|right|space-around|space-between|space-evenly|start|stretch|\d+(?:\.\d+)?(?:fr)?))*$/

type PreviewDocumentLike = Pick<PromptDocument, 'content' | 'language' | 'role' | 'source_path'>
  | Pick<PromptDocumentInput, 'content' | 'language' | 'role' | 'sourcePath'>

export function parseAndValidateGlossaryPreviewBundle(
  documents: PreviewDocumentLike[],
  glossary: PromptGlossaryDocument,
  options: { requireComplete?: boolean } = {},
): PromptGlossaryPreviewBundle | null {
  const normalized = documents.map(toDocumentShape)
  const previewDocuments = normalized.filter(isGlossaryPreviewDocument)
  const styleDocuments = normalized.filter(isGlossaryPreviewStyleDocument)
  if (!previewDocuments.length && !styleDocuments.length) {
    if (options.requireComplete)
      throw new Error('发布术语合集前必须填写 HTML 预览和预览样式')
    return null
  }
  if (previewDocuments.length !== 1 || styleDocuments.length !== 1)
    throw new Error('术语合集必须且只能包含一份预览 JSON 和一份预览样式')

  const rawJson = previewDocuments[0]!.content
  const css = styleDocuments[0]!.content.normalize('NFC').trim()
  assertByteLimit(rawJson, MAX_JSON_BYTES, '预览 JSON')
  assertByteLimit(css, MAX_STYLE_BYTES, '预览样式')
  assertNoSourceBrand(rawJson, '预览 JSON')
  assertNoSourceBrand(css, '预览样式')
  validatePreviewCss(css)

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  }
  catch {
    throw new Error('术语预览 JSON 格式无效')
  }
  const document = normalizePreviewDocument(parsed)
  const glossaryIds = new Set(glossary.sections.flatMap(section => section.items.map(item => item.id)))
  const items: Record<string, { html: string, summary: string }> = {}
  for (const item of document.items) {
    if (!glossaryIds.has(item.termId))
      throw new Error(`预览包含未知术语：${item.termId}`)
    if (items[item.termId])
      throw new Error(`预览术语重复：${item.termId}`)
    const html = validatePreviewHtml(item.html, item.termId)
    const summary = normalizeSummary(item.summary, item.termId)
    assertNoSourceBrand(summary, `术语 ${item.termId} 的预览说明`)
    items[item.termId] = { html, summary }
  }
  if (options.requireComplete) {
    const missing = [...glossaryIds].filter(id => !items[id])
    if (missing.length)
      throw new Error(`术语预览缺少 ${missing.length} 项：${missing.slice(0, 3).join('、')}`)
  }
  const canonical = JSON.stringify({ css, items: Object.keys(items).sort().map(termId => ({ termId, ...items[termId] })) })
  return {
    css,
    fingerprint: createHash('sha256').update(canonical).digest('hex'),
    items,
  }
}

export function validateGlossaryPreviewCss(css: string) {
  validatePreviewCss(css.normalize('NFC').trim())
}

export function validateGlossaryPreviewHtml(html: string) {
  return validatePreviewHtml(html, 'preview')
}

export function validatePromptGlossaryPreviewDocuments(documents: PromptDocumentInput[], status: PromptStatus) {
  const primary = documents.find(document => document.isPrimary)
  const glossary = primary?.language.trim().toLowerCase() === PROMPT_GLOSSARY_LANGUAGE
    ? parsePromptGlossaryContent(primary.content)
    : null
  const hasReservedPreview = documents.some((document) => {
    const normalized = toDocumentShape(document)
    return isGlossaryPreviewDocument(normalized) || isGlossaryPreviewStyleDocument(normalized)
  })
  if (!glossary) {
    if (hasReservedPreview)
      throw new Error('PREVIEWS.json 和术语预览样式只能用于术语合集')
    return null
  }
  return parseAndValidateGlossaryPreviewBundle(documents, glossary, { requireComplete: status === 'published' })
}

function assertByteLimit(value: string, limit: number, label: string) {
  if (Buffer.byteLength(value, 'utf8') > limit)
    throw new Error(`${label}不能超过 ${Math.floor(limit / 1024)} KiB`)
}

function assertNoSourceBrand(value: string, label: string) {
  if (FORBIDDEN_SOURCE_PATTERN.test(value.normalize('NFC')))
    throw new Error(`${label}包含禁止的来源品牌或外部地址`)
}

function normalizePreviewDocument(value: unknown): PromptGlossaryPreviewDocument {
  const input = requireRecord(value, '术语预览必须是对象')
  if (input.schemaVersion !== PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION)
    throw new Error('术语预览版本不受支持')
  if (!Array.isArray(input.items))
    throw new Error('术语预览 items 必须是数组')
  return {
    items: input.items.map((value, index) => {
      const item = requireRecord(value, `第 ${index + 1} 个术语预览格式无效`)
      const termId = normalizeString(item.termId)
      if (!ID_PATTERN.test(termId))
        throw new Error(`预览术语 ID 无效：${termId}`)
      return {
        html: normalizeString(item.html),
        summary: normalizeString(item.summary),
        termId,
      }
    }),
    schemaVersion: PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION,
  }
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string')
    throw new Error('术语预览字段必须是字符串')
  return value.normalize('NFC').trim()
}

function normalizeSummary(value: string, termId: string) {
  const summary = value.normalize('NFC').trim()
  if (!summary || Array.from(summary).length > 160)
    throw new Error(`术语 ${termId} 的预览说明必须为 1—160 个字符`)
  return summary
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(message)
  return value as Record<string, unknown>
}

function toDocumentShape(document: PreviewDocumentLike): PreviewDocumentLike & { source_path: string } {
  return {
    ...document,
    source_path: 'source_path' in document ? document.source_path : document.sourcePath,
  }
}

function validateDeclaration(property: string, value: string, important: boolean) {
  if (important)
    throw new Error('预览样式禁止 !important')
  if (!ALLOWED_PROPERTIES.has(property) || property.startsWith('--'))
    throw new Error(`预览样式属性不受支持：${property}`)
  const normalized = value.trim()
  const ast = valueParser(normalized)
  ast.walk((node) => {
    if (node.type === 'comment' || node.type === 'string')
      throw new Error(`预览样式属性值不受支持：${property}`)
    if (node.type === 'function') {
      if (node.value === 'var') {
        const token = valueParser.stringify(node.nodes).trim()
        if (![...ALLOWED_COLOR_TOKENS, '--preview-font', '--preview-mono'].includes(token))
          throw new Error(`预览样式变量不受支持：${token}`)
      }
      else if (property === 'transform' && ['rotate', 'scale', 'translate', 'translateX', 'translateY'].includes(node.value)) {
        if (!/^-?\d+(?:\.\d+)?(?:deg|px|%)?(?:\s*,\s*-?\d+(?:\.\d+)?(?:px|%)?)?$/.test(valueParser.stringify(node.nodes).trim()))
          throw new Error('预览样式 transform 参数无效')
      }
      else {
        throw new Error(`预览样式函数不受支持：${node.value}`)
      }
    }
  })
  if (COLOR_PROPERTIES.has(property) || property === 'font-family') {
    if (!/^var\(--preview-[a-z-]+\)$/.test(normalized))
      throw new Error(`预览样式 ${property} 必须使用主题变量`)
    return
  }
  if (LENGTH_PROPERTIES.has(property)) {
    if (!validateLengths(normalized, property.startsWith('margin')))
      throw new Error(`预览样式 ${property} 尺寸无效`)
    return
  }
  if (/^(?:border|border-(?:top|right|bottom|left))$/.test(property)) {
    if (!/^(?:0|(?:[1-8]px|0\.\d+rem) (?:solid|dashed) var\(--preview-(?:accent|bg|blue|border|clay|cyan|danger|dark-bg|dark-surface|dark-text|earth|gold|ink|muted|paper|pink|purple|red|sand|success|surface|terminal|text|warning|yellow)\))$/.test(normalized))
      throw new Error(`预览样式 ${property} 边框无效`)
    return
  }
  if (property === 'grid-column' || property === 'grid-row') {
    if (!/^(?:[1-9]|1[0-2])(?:\s*\/\s*(?:[1-9]|1[0-2]|span\s+(?:[1-9]|1[0-2])))?$/.test(normalized))
      throw new Error(`预览样式 ${property} 网格位置无效`)
    return
  }
  if (property === 'box-shadow') {
    if (normalized !== 'none' && !/^(?:-?\d+px\s+){3}-?\d+px\s+var\(--preview-shadow\)$/.test(normalized))
      throw new Error('预览样式阴影无效')
    return
  }
  if (property === 'transform')
    return
  if (!SAFE_KEYWORD_VALUE.test(normalized))
    throw new Error(`预览样式 ${property} 属性值无效`)
}

function validateLengths(value: string, allowNegative: boolean) {
  if (['auto', '100%'].includes(value))
    return true
  const parts = value.split(/\s+/)
  if (parts.length < 1 || parts.length > 4)
    return false
  return parts.every((part) => {
    if (part === '0')
      return true
    const match = part.match(/^(-?\d+(?:\.\d+)?)(px|rem|%)$/)
    if (!match)
      return false
    const amount = Number(match[1])
    const unit = match[2]
    if (amount < 0 && !allowNegative)
      return false
    const limit = unit === 'px' ? (amount < 0 ? 64 : 2048) : unit === 'rem' ? (amount < 0 ? 4 : 128) : 100
    return Math.abs(amount) <= limit
  })
}

function validatePreviewCss(css: string) {
  if (!css)
    throw new Error('请填写术语预览样式')
  if (css.includes('<') || css.includes('/*') || css.includes('*/'))
    throw new Error('预览样式禁止 HTML 结束符和 CSS 注释')
  assertNoSourceBrand(css, '预览样式')
  let root: postcss.Root
  try {
    root = postcss.parse(css, { from: undefined })
  }
  catch {
    throw new Error('预览样式不是有效 CSS')
  }
  let declarationCount = 0
  let ruleCount = 0
  root.walk((node) => {
    if (node.type === 'comment')
      throw new Error('预览样式禁止 CSS 注释')
    if (node.type === 'atrule') {
      if (node.name.toLowerCase() !== 'media' || node.params.trim() !== '(prefers-reduced-motion: reduce)' || !node.nodes)
        throw new Error(`预览样式禁止 @${node.name}`)
      if (node.parent?.type === 'atrule')
        throw new Error('预览样式禁止嵌套 at-rule')
      return
    }
    if (node.type === 'rule') {
      ruleCount += 1
      if (ruleCount > MAX_STYLE_RULES)
        throw new Error(`预览样式规则不能超过 ${MAX_STYLE_RULES} 条`)
      validateSelector(node.selector)
      return
    }
    if (node.type === 'decl') {
      declarationCount += 1
      if (declarationCount > MAX_STYLE_DECLARATIONS)
        throw new Error(`预览样式声明不能超过 ${MAX_STYLE_DECLARATIONS} 条`)
      validateDeclaration(node.prop.toLowerCase(), node.value, node.important)
    }
  })
}

function validatePreviewHtml(value: string, termId: string) {
  const html = value.normalize('NFC').trim()
  assertByteLimit(html, MAX_HTML_BYTES, `术语 ${termId} 的 HTML 预览`)
  if (!html || FORBIDDEN_RAW_PATTERN.test(html))
    throw new Error(`术语 ${termId} 的 HTML 预览包含禁止的标签或属性`)
  assertNoSourceBrand(html, `术语 ${termId} 的 HTML 预览`)
  const sanitized = sanitizeHtml(html, {
    allowedAttributes: {
      '*': ['class', 'data-name'],
    },
    allowedTags: ALLOWED_TAGS,
    exclusiveFilter(frame) {
      const classes = String(frame.attribs.class ?? '').split(/\s+/).filter(Boolean)
      if (classes.some(className => !CLASS_PATTERN.test(className)))
        return true
      const dataName = frame.attribs['data-name']
      return dataName !== undefined && !DATA_VALUE_PATTERN.test(dataName)
    },
  }).trim()
  if (sanitized !== html)
    throw new Error(`术语 ${termId} 的 HTML 预览未通过严格白名单`)
  return sanitized
}

function validateSelector(selector: string) {
  try {
    selectorParser((root) => {
      root.each((candidate) => {
        let first = true
        let segments = 0
        candidate.each((node) => {
          if (node.type === 'class') {
            if (!CLASS_PATTERN.test(node.value))
              throw new Error('预览样式类名无效')
            if (first && node.value !== 'preview-root')
              throw new Error('预览样式选择器必须以 .preview-root 开始')
            first = false
            segments += 1
          }
          else if (node.type === 'tag') {
            if (first || !ALLOWED_TAGS.includes(node.value))
              throw new Error(`预览样式禁止 ${node.value} 标签选择器`)
            segments += 1
          }
          else if (node.type === 'combinator') {
            if (node.value.trim() && node.value.trim() !== '>')
              throw new Error('预览样式只允许后代和直接子级组合器')
          }
          else if (node.type === 'attribute') {
            if (node.attribute !== 'data-name' || node.operator !== '=' || !node.value || !DATA_VALUE_PATTERN.test(node.value))
              throw new Error('预览样式只允许 data-name 精确等值选择器')
            first = false
            segments += 1
          }
          else if (node.type === 'pseudo') {
            if (![':first-child', ':last-child'].includes(node.value) && node.value !== ':nth-child')
              throw new Error(`预览样式禁止伪类 ${node.value}`)
            if (node.value === ':nth-child') {
              const argument = node.nodes?.toString().trim() ?? ''
              if (!/^(?:odd|even|[1-9]|1[0-2])$/.test(argument))
                throw new Error('预览样式 nth-child 参数无效')
            }
          }
          else {
            throw new Error(`预览样式禁止 ${node.type} 选择器`)
          }
        })
        if (first || segments > 6)
          throw new Error('预览样式选择器层级无效')
      })
    }).processSync(selector)
  }
  catch (error) {
    throw new Error(error instanceof Error ? error.message : '预览样式选择器无效')
  }
}

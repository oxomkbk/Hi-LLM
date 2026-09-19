import type { PromptAsset, PromptContentKind, PromptDocument, PromptDocumentSummary } from '@/types'

export type PromptDetailLayout = 'instruction-first' | 'visual-first'
export type PromptDocumentMode = 'reading' | 'source'
export interface PromptDocumentPresentation {
  description: string
  eyebrow: string
  title: string
  tone: PromptDocumentTone
}
export type PromptDocumentTone = 'example' | 'instruction' | 'negative' | 'reading' | 'technical'

export type PromptPreviewKind = 'image' | 'video' | 'web'

const DOCUMENT_PRESENTATION: Record<PromptDocument['role'], PromptDocumentPresentation> = {
  design: {
    description: '理解设计意图、约束和取舍，适合在执行前快速浏览。',
    eyebrow: '设计资料',
    title: '设计说明',
    tone: 'reading',
  },
  example: {
    description: '查看输入或输出范例，理解这套 Prompt 应该怎样使用。',
    eyebrow: '参考内容',
    title: '参考示例',
    tone: 'example',
  },
  negative_prompt: {
    description: '与主提示词一起使用，明确排除不希望出现的结果。',
    eyebrow: '限制条件',
    title: '需要避免',
    tone: 'negative',
  },
  other: {
    description: '该内容为补充文件，可按需查看或复制。',
    eyebrow: '补充资料',
    title: '补充内容',
    tone: 'reading',
  },
  parameters: {
    description: '生成或执行时使用的参数配置，复制前请按目标工具调整。',
    eyebrow: '执行配置',
    title: '参数配置',
    tone: 'technical',
  },
  prompt: {
    description: '这是最主要的可用内容。替换其中的变量后，可直接交给对应 AI 工具。',
    eyebrow: '核心内容',
    title: '主提示词',
    tone: 'instruction',
  },
  readme: {
    description: '包含使用方法、变量说明与注意事项，适合按章节阅读。',
    eyebrow: '使用指南',
    title: '使用说明',
    tone: 'reading',
  },
  style: {
    description: '控制界面、画面或输出格式的样式规则。',
    eyebrow: '视觉规则',
    title: '样式规则',
    tone: 'technical',
  },
  tokens: {
    description: '可复用的设计变量与取值，适合复制到设计或开发流程。',
    eyebrow: '设计规范',
    title: '设计变量',
    tone: 'technical',
  },
}

const SOURCE_FIRST_ROLES = new Set<PromptDocument['role']>(['parameters', 'style', 'tokens'])
const MARKDOWN_LANGUAGES = new Set(['markdown', 'md'])

export function defaultPromptDocumentMode(document: PromptDocumentSummary | null): PromptDocumentMode {
  return supportsPromptDocumentReading(document) ? 'reading' : 'source'
}

export function getPromptDocumentPresentation(document: PromptDocumentSummary): PromptDocumentPresentation {
  const presentation = DOCUMENT_PRESENTATION[document.role]
  if (document.role !== 'other')
    return presentation

  return {
    ...presentation,
    title: document.name || presentation.title,
  }
}

export function getPromptPreviewKind(asset: PromptAsset): PromptPreviewKind | null {
  if (!asset.url)
    return null
  const mime = asset.mime_type?.trim().toLowerCase() ?? ''
  if (asset.role === 'web_preview')
    return !mime || ['text/html', 'application/xhtml+xml'].includes(mime) ? 'web' : null
  if (asset.role === 'video')
    return !mime || mime.startsWith('video/') ? 'video' : null
  if (['cover', 'image', 'poster'].includes(asset.role))
    return !mime || mime.startsWith('image/') ? 'image' : null
  return null
}

export function promptDocumentLabel(document: PromptDocumentSummary) {
  if (document.role === 'prompt' && !document.is_primary)
    return document.name || '补充提示词'
  return getPromptDocumentPresentation(document).title
}

export function resolvePromptDetailLayout(kind: PromptContentKind, hasPreview: boolean): PromptDetailLayout {
  if (!hasPreview || kind === 'adaptation')
    return 'instruction-first'
  return 'visual-first'
}

export function selectPrimaryPromptPreview(assets: PromptAsset[]) {
  const previews = selectPromptPreviewAssets(assets)
  return previews.find(asset => asset.is_primary) ?? previews[0] ?? null
}

export function selectPromptPreviewAssets(assets: PromptAsset[]) {
  return assets.filter(asset => getPromptPreviewKind(asset) !== null)
}

export function supportsPromptDocumentReading(document: PromptDocumentSummary | null): document is PromptDocumentSummary {
  if (!document)
    return false
  if (SOURCE_FIRST_ROLES.has(document.role))
    return false
  const language = document.language.trim().toLowerCase()
  return ['design', 'example', 'readme'].includes(document.role)
    || MARKDOWN_LANGUAGES.has(language)
    || /\.(?:md|markdown)$/i.test(document.source_path)
}

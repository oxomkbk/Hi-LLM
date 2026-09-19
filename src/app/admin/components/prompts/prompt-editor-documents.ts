import {
  isGlossaryPreviewDocument,
  isGlossaryPreviewStyleDocument,
  PROMPT_GLOSSARY_PREVIEW_LANGUAGE,
  PROMPT_GLOSSARY_PREVIEW_PATH,
  PROMPT_GLOSSARY_PREVIEW_STYLE_PATH,
} from '../../../../lib/prompts/glossary-preview'

import type { PromptDetail, PromptDocumentInput } from '@/types'

export type PromptEditorDocumentKey = keyof PromptEditorDocuments

export interface PromptEditorDocuments {
  glossaryPreview: string
  glossaryStyle: string
  negative: string
  prompt: string
  readme: string
  style: string
}

export function buildPromptEditorDocuments(value: PromptEditorDocuments, original: PromptDetail['documents']): PromptDocumentInput[] {
  const documents: PromptDocumentInput[] = []
  const handled = new Set<PromptEditorDocumentKey>()
  for (const document of original) {
    const key = promptEditorDocumentKey(document)
    if (key && !handled.has(key)) {
      handled.add(key)
      if (!value[key].trim())
        continue
      documents.push(toDocumentInput(document, value[key]))
      continue
    }
    documents.push(toDocumentInput(document, document.content))
  }
  const defaults: Record<PromptEditorDocumentKey, PromptDocumentInput> = {
    glossaryPreview: { content: value.glossaryPreview, isPrimary: false, language: PROMPT_GLOSSARY_PREVIEW_LANGUAGE, name: '术语预览', role: 'example', sourcePath: PROMPT_GLOSSARY_PREVIEW_PATH },
    glossaryStyle: { content: value.glossaryStyle, isPrimary: false, language: 'css', name: '术语预览样式', role: 'style', sourcePath: PROMPT_GLOSSARY_PREVIEW_STYLE_PATH },
    negative: { content: value.negative, isPrimary: false, language: 'markdown', name: 'Negative Prompt', role: 'negative_prompt', sourcePath: 'prompts/negative.md' },
    prompt: { content: value.prompt, isPrimary: true, language: 'markdown', name: 'Prompt', role: 'prompt', sourcePath: 'prompts/prompt.md' },
    readme: { content: value.readme, isPrimary: false, language: 'markdown', name: 'README', role: 'readme', sourcePath: 'README.md' },
    style: { content: value.style, isPrimary: false, language: 'css', name: 'Style', role: 'style', sourcePath: 'styles/style.css' },
  }
  for (const key of Object.keys(defaults) as PromptEditorDocumentKey[]) {
    if (!handled.has(key) && value[key].trim())
      documents.push(defaults[key])
  }
  return documents
}

export function createPromptEditorDocuments(initial: PromptDetail | null): PromptEditorDocuments {
  const result: PromptEditorDocuments = { glossaryPreview: '', glossaryStyle: '', negative: '', prompt: '', readme: '', style: '' }
  for (const document of initial?.documents ?? []) {
    const key = promptEditorDocumentKey(document)
    if (key && !result[key])
      result[key] = document.content
  }
  return result
}

function promptEditorDocumentKey(document: PromptDetail['documents'][number]): PromptEditorDocumentKey | null {
  if (isGlossaryPreviewDocument(document))
    return 'glossaryPreview'
  if (isGlossaryPreviewStyleDocument(document))
    return 'glossaryStyle'
  if (document.is_primary)
    return 'prompt'
  if (document.role === 'negative_prompt')
    return 'negative'
  if (document.role === 'readme')
    return 'readme'
  if (document.role === 'style')
    return 'style'
  return null
}

function toDocumentInput(document: PromptDetail['documents'][number], content: string): PromptDocumentInput {
  return {
    content,
    isPrimary: document.is_primary,
    language: document.language,
    name: document.name,
    role: document.role,
    sourcePath: document.source_path,
  }
}

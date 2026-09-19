import { notFound } from 'next/navigation'

import { safeReturnTo } from '@/lib/navigation/return-context'
import { parsePromptGlossaryDocument, PROMPT_GLOSSARY_LANGUAGE } from '@/lib/prompts/glossary'
import { isGlossaryPreviewDocument, isGlossaryPreviewStyleDocument } from '@/lib/prompts/glossary-preview'
import { parseAndValidateGlossaryPreviewBundle } from '@/lib/prompts/glossary-preview-security'
import { promptRepository } from '@/lib/repositories/prompts'

import PromptWorkbench from './prompt-workbench'

import type { PromptDetailView, PromptDocument, PromptDocumentSummary } from '@/types'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const prompt = await promptRepository.findPublishedBySlug(slug).catch(() => null)
  return prompt ? { title: `${prompt.title} | Prompts`, description: prompt.summary } : { title: 'Prompt 不存在' }
}

export default async function PromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const prompt = await promptRepository.findPublishedBySlug(slug).catch(() => null)
  if (!prompt)
    notFound()
  const markedPrimaryDocument = prompt.documents.find(document => document.is_primary) ?? null
  const initialStandardDocument = markedPrimaryDocument ?? prompt.documents[0] ?? null
  const glossaryMarked = markedPrimaryDocument?.language.trim().toLowerCase() === PROMPT_GLOSSARY_LANGUAGE
  const glossary = parsePromptGlossaryDocument(markedPrimaryDocument)
  const glossaryInvalid = Boolean(glossaryMarked && !glossary)
  let glossaryPreview = null
  if (glossary) {
    try {
      glossaryPreview = parseAndValidateGlossaryPreviewBundle(prompt.documents, glossary, { requireComplete: true })
    }
    catch {
      glossaryPreview = null
    }
  }
  const visibleDocuments = glossaryInvalid
    ? []
    : glossaryMarked
      ? prompt.documents.filter(document => !isGlossaryPreviewDocument(document) && !isGlossaryPreviewStyleDocument(document))
      : prompt.documents
  const data = {
    ...prompt,
    assets: prompt.assets.map(asset => ({
      ...asset,
      url: asset.role === 'web_preview'
        ? `/api/public/prompts/${encodeURIComponent(slug)}/preview/${asset.source_path.split('/').map(encodeURIComponent).join('/')}`
        : `/api/public/prompts/${encodeURIComponent(slug)}/assets/${asset.id}`,
    })),
    cover_asset: prompt.cover_asset ? { ...prompt.cover_asset, url: `/api/public/prompts/${encodeURIComponent(slug)}/assets/${prompt.cover_asset.id}` } : null,
    documents: visibleDocuments.map(toDocumentSummary),
    initial_document: glossaryMarked ? null : initialStandardDocument,
  } satisfies PromptDetailView
  const returnHref = safeReturnTo(query.returnTo, '/prompts', { exactPathnames: ['/prompts'] })
  const initialTermQuery = readSingleValue(query.term).slice(0, 100)
  return (
    <PromptWorkbench
      glossary={glossary}
      glossaryInvalid={glossaryInvalid}
      glossaryPreview={glossaryPreview}
      initialTermQuery={initialTermQuery}
      prompt={data}
      returnHref={returnHref}
    />
  )
}

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function toDocumentSummary(document: PromptDocument): PromptDocumentSummary {
  const { content: _content, ...summary } = document
  return summary
}

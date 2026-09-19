import { createPromptSlug } from '@/lib/prompts'
import { PROMPT_GLOSSARY_LANGUAGE } from '@/lib/prompts/glossary'
import { isGlossaryPreviewDocument, isGlossaryPreviewStyleDocument } from '@/lib/prompts/glossary-preview'
import { promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string, slug: string }> }) {
  try {
    const { documentId, slug } = await params
    if (createPromptSlug(slug) !== slug || !UUID_PATTERN.test(documentId))
      return promptSuccess(null, 'Prompt 文件地址无效', 400)
    const document = await promptRepository.findPublishedDocument(slug, documentId)
    if (!document || isReservedGlossaryDocument(document))
      return promptSuccess(null, 'Prompt 文件不存在', 404)
    return promptSuccess(document, 'Prompt 文件已加载', 200, {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
      'X-Content-Type-Options': 'nosniff',
    })
  }
  catch {
    return promptSuccess(null, 'Prompt 文件暂时无法加载', 500)
  }
}

function isReservedGlossaryDocument(document: Parameters<typeof isGlossaryPreviewDocument>[0]) {
  return document.language.trim().toLowerCase() === PROMPT_GLOSSARY_LANGUAGE
    || isGlossaryPreviewDocument(document)
    || isGlossaryPreviewStyleDocument(document)
}

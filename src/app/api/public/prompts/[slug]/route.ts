import { createPromptSlug } from '@/lib/prompts'
import { isGlossaryPreviewDocument, isGlossaryPreviewStyleDocument } from '@/lib/prompts/glossary-preview'
import { promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (createPromptSlug(slug) !== slug)
      return promptSuccess(null, 'Prompt 地址无效', 400)
    const prompt = await promptRepository.findPublishedBySlug(slug)
    if (!prompt)
      return promptSuccess(null, 'Prompt 不存在', 404)
    return promptSuccess({
      ...prompt,
      assets: prompt.assets.map(asset => ({
        ...asset,
        url: asset.role === 'web_preview'
          ? `/api/public/prompts/${encodeURIComponent(slug)}/preview/${asset.source_path.split('/').map(encodeURIComponent).join('/')}`
          : `/api/public/prompts/${encodeURIComponent(slug)}/assets/${asset.id}`,
      })),
      cover_asset: prompt.cover_asset ? { ...prompt.cover_asset, url: `/api/public/prompts/${encodeURIComponent(slug)}/assets/${prompt.cover_asset.id}` } : null,
      documents: prompt.documents.filter(document => !isGlossaryPreviewDocument(document) && !isGlossaryPreviewStyleDocument(document)),
    }, 'Prompt 已加载', 200, { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' })
  }
  catch {
    return promptSuccess(null, 'Prompt 数据暂时不可用', 500)
  }
}

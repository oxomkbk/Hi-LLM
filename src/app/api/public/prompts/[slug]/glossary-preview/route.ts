import { Buffer } from 'node:buffer'

import { NextResponse } from 'next/server'

import { createPromptSlug } from '@/lib/prompts'
import { parsePromptGlossaryDocument } from '@/lib/prompts/glossary'
import { parseAndValidateGlossaryPreviewBundle } from '@/lib/prompts/glossary-preview-security'
import { getGlossaryShowcaseDefinition } from '@/lib/prompts/glossary-showcase'
import { promptRepository } from '@/lib/repositories/prompts'
import { RESPONSE, responseMessage } from '@/lib/utils'

const MAX_RESPONSE_BYTES = 32 * 1024

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (createPromptSlug(slug) !== slug)
      return json(null, 'Prompt 地址无效', 400)
    const showcase = getGlossaryShowcaseDefinition(slug)
    const prompt = showcase ? await promptRepository.findPublishedBySlug(slug) : null
    const primary = prompt?.documents.find(document => document.is_primary) ?? null
    const glossary = parsePromptGlossaryDocument(primary)
    if (!prompt || !showcase || !glossary)
      return json(null, '术语预览不存在', 404)
    const bundle = parseAndValidateGlossaryPreviewBundle(prompt.documents, glossary, { requireComplete: true })
    const preview = bundle?.items[showcase.termId]
    if (!bundle || !preview)
      return json(null, '术语预览不存在', 404)
    return json({ css: bundle.css, fingerprint: bundle.fingerprint, preview }, '术语预览已加载', 200, {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'ETag': `"${bundle.fingerprint}"`,
    })
  }
  catch {
    return json(null, '术语预览暂时不可用', 500)
  }
}

function json(data: unknown, message: string, status: number, headers: HeadersInit = {}) {
  const body = JSON.stringify(responseMessage(data, message, status >= 400 ? RESPONSE.ERROR : RESPONSE.SUCCESS, status >= 400 ? { code: 'GLOSSARY_PREVIEW_UNAVAILABLE', retryable: false } : undefined))
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES)
    return NextResponse.json(responseMessage(null, '术语预览响应超过安全上限', RESPONSE.ERROR, { code: 'GLOSSARY_PREVIEW_TOO_LARGE', retryable: false }), { status: 500 })
  return new NextResponse(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
    status,
  })
}

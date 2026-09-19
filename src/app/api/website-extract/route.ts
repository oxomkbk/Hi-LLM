import { NextResponse } from 'next/server'

import { getServerSession } from '@/lib/auth/session'
import { publicServerError } from '@/lib/http/public-error'
import { LlmNotConfiguredError } from '@/lib/llm/settings'
import { generateWebsiteDescription } from '@/lib/llm/website-description'
import {
  assertSameOrigin,
  createTrustedVisitorHash,
  normalizePublicHttpsUrl,
} from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'
import { reserveWebsiteExtraction, WebsiteExtractionRateLimitError } from '@/lib/websites/extraction-rate-limit'
import { extractWebsiteIcon, extractWebsiteMetadata } from '@/lib/websites/metadata'
import { PublicResourceError } from '@/lib/websites/public-resource'

import type { WebsiteExtractionResult } from '@/types'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 16 * 1024)
      return NextResponse.json(responseMessage(null, '请求内容过大', RESPONSE.ERROR), { status: 413 })

    const [input, session] = await Promise.all([
      request.json() as Promise<{ url?: unknown }>,
      getServerSession(request.headers).catch(() => null),
    ])
    const url = normalizePublicHttpsUrl(input.url)
    const isAdmin = session?.user.role === 'admin' && session.user.status === 'active'
    if (!isAdmin) {
      const visitorHash = createTrustedVisitorHash(request, 'website-extraction')
      await reserveWebsiteExtraction(visitorHash)
    }

    const metadata = await extractWebsiteMetadata(url)
    const warnings: string[] = []
    const [descriptionResult, icon] = await Promise.all([
      generateWebsiteDescription({
        name: metadata.name,
        pageDescription: metadata.description,
        title: metadata.title,
        url: metadata.finalUrl,
      })
        .then(description => ({ description, generated: true }))
        .catch((error) => {
          warnings.push(error instanceof LlmNotConfiguredError
            ? '尚未配置大模型，已保留网站原始介绍'
            : '大模型生成失败，已保留网站原始介绍')
          return { description: metadata.description.slice(0, 500), generated: false }
        }),
      extractWebsiteIcon(metadata.iconUrls),
    ])
    if (!icon)
      warnings.push('未找到可用的 PNG、JPG、WebP 或 ICO 图标')

    const data: WebsiteExtractionResult = {
      description: descriptionResult.description,
      descriptionGeneratedByLlm: descriptionResult.generated,
      icon,
      name: metadata.name,
      sourceDescription: metadata.description.slice(0, 500),
      title: metadata.title,
      url: metadata.finalUrl,
      warnings,
    }
    return NextResponse.json(responseMessage(data, warnings.length ? '网站信息已提取，部分内容需要确认' : '网站信息已提取'))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    const inputError = [
      '请求来源校验失败',
      '请求内容过大',
      '请输入合法的网站链接',
      '网站链接必须使用 HTTPS',
      '网站链接不能包含账号或密码',
      '网站链接不能使用非标准端口',
      '网站链接必须使用可公开访问的域名',
    ].includes(message)
    const known = error instanceof WebsiteExtractionRateLimitError || error instanceof PublicResourceError || inputError
    if (!known) {
      const failure = publicServerError(error, '网站信息提取失败')
      return NextResponse.json(responseMessage(null, failure.message, RESPONSE.ERROR, {
        code: failure.code,
        retryable: failure.retryable,
      }), { status: failure.status })
    }

    const status = error instanceof WebsiteExtractionRateLimitError
      ? error.status
      : error instanceof PublicResourceError
        ? 400
        : 400
    const code = error instanceof WebsiteExtractionRateLimitError
      ? 'WEBSITE_EXTRACTION_RATE_LIMITED'
      : error instanceof PublicResourceError
        ? error.code
        : 'WEBSITE_EXTRACTION_REQUEST_INVALID'
    return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }), { status })
  }
}

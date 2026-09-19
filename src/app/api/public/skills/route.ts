import { NextResponse } from 'next/server'

import { isPublicCatalogSort } from '@/lib/catalog-sort'
import { skillRepository } from '@/lib/repositories/skills'
import {
  sanitizeSkillSearchTerm,
  SKILL_CATEGORIES,
  SKILL_PLATFORMS,
  SKILL_SCENARIOS,
} from '@/lib/skills'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

const PUBLIC_SKILLS_ERROR = 'Skills 数据暂时不可用，请稍后重试'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const pageIndex = parseInteger(searchParams.get('pageIndex'), 0, 0, 10000)
    const pageSize = parseInteger(searchParams.get('pageSize'), 12, 1, 50)
    const q = sanitizeSkillSearchTerm(searchParams.get('q'))
    const category = searchParams.get('category')?.trim() || ''
    const platform = searchParams.get('platform')?.trim() || ''
    const scenario = searchParams.get('scenario')?.trim() || ''
    const featured = parseOptionalBoolean(searchParams.get('featured'))
    const sort = searchParams.get('sort') || 'latest'

    if (!isPublicCatalogSort(sort))
      return NextResponse.json(responseMessage(null, '排序方式无效', RESPONSE.ERROR), { status: 400 })

    if (category && !(SKILL_CATEGORIES as readonly string[]).includes(category))
      return NextResponse.json(responseMessage(null, 'Skill 分类无效', RESPONSE.ERROR), { status: 400 })
    if (platform && !(SKILL_PLATFORMS as readonly string[]).includes(platform))
      return NextResponse.json(responseMessage(null, '适用平台无效', RESPONSE.ERROR), { status: 400 })
    if (scenario && !(SKILL_SCENARIOS as readonly string[]).includes(scenario))
      return NextResponse.json(responseMessage(null, '应用领域无效', RESPONSE.ERROR), { status: 400 })

    const start = pageIndex * pageSize
    const { list, total } = await skillRepository.list({
      category: category || undefined,
      featured,
      limit: pageSize,
      offset: start,
      platform: platform || undefined,
      publishedOnly: true,
      q: q || undefined,
      scenario: scenario || undefined,
      sortMode: sort,
    })

    return NextResponse.json(responseMessage({
      list,
      page: pageIndex + 1,
      pageSize,
      total,
    }), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isInvalidRequest = message === '分页参数无效' || message === '精选筛选参数无效'

    return NextResponse.json(
      responseMessage(null, isInvalidRequest ? message : PUBLIC_SKILLS_ERROR, RESPONSE.ERROR),
      { status: isInvalidRequest ? 400 : 500 },
    )
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === '')
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('分页参数无效')
  return parsed
}

function parseOptionalBoolean(value: string | null) {
  if (value === null || value === '')
    return null
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error('精选筛选参数无效')
}

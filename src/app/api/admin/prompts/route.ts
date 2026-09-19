import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { readPromptJsonBody, sanitizePromptAdminInput, sanitizePromptSearchTerm } from '@/lib/prompts'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

import type { PromptContentKind, PromptStatus, PromptSubmissionOrigin } from '@/types'
import type { NextRequest } from 'next/server'

const STATUS = new Set<PromptStatus>(['archived', 'draft', 'published'])
const KINDS = new Set<PromptContentKind>(['adaptation', 'image', 'video', 'web_ui'])
const ORIGINS = new Set<PromptSubmissionOrigin>(['admin', 'community'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const pageIndex = integer(params.get('pageIndex'), 0, 0, 100_000)
    const pageSize = integer(params.get('pageSize'), 20, 1, 100)
    const status = params.get('status') as PromptStatus | null
    const kind = params.get('kind') as PromptContentKind | null
    const origin = params.get('origin') as PromptSubmissionOrigin | null
    if (status && !STATUS.has(status))
      throw new Error('状态筛选无效')
    if (kind && !KINDS.has(kind))
      throw new Error('内容类型筛选无效')
    if (origin && !ORIGINS.has(origin))
      throw new Error('内容来源筛选无效')
    const [{ list, total }, categories] = await Promise.all([
      promptRepository.list({
        category: params.get('category') || undefined,
        kind,
        limit: pageSize,
        offset: pageIndex * pageSize,
        origin,
        q: sanitizePromptSearchTerm(params.get('q')) || undefined,
        status,
      }),
      promptRepository.listCategories(),
    ])
    return promptSuccess({ categories, list, page: pageIndex + 1, pageSize, total }, 'Prompts 列表已加载', 200, { 'Cache-Control': 'no-store' })
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), readPromptJsonBody(request)])
    const input = sanitizePromptAdminInput(body)
    const created = await promptRepository.create(input, session.user)
    if (created.publish_requested_at) {
      const queued = await createAssessmentJob({
        actor: session.user,
        subjectId: created.id,
        subjectType: 'prompt',
        trigger: 'publish_gate',
      }).then(() => true).catch(() => false)
      return promptSuccess(created, queued ? '内容已保存，安全检查通过后会自动发布' : '内容已保存，安全检查暂未启动', 202)
    }
    return promptSuccess(created, input.status === 'published' ? 'Prompt 已发布' : 'Prompt 草稿已保存', 201)
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      return promptErrorResponse(Object.assign(new Error('访问地址或文档路径已存在'), { status: 409, code: 'PROMPT_CONFLICT' }))
    return promptErrorResponse(error)
  }
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error('分页参数无效')
  return parsed
}

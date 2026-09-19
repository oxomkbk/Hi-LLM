import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import {
  MCP_CATEGORIES,
  readMcpJsonBody,
  sanitizeMcpAdminInput,
  sanitizeMcpSearchTerm,
} from '@/lib/mcps'
import { mcpRepository, McpRepositoryError } from '@/lib/repositories/mcps'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { McpStatus } from '@/types'
import type { NextRequest } from 'next/server'

const STATUSES = new Set<McpStatus>(['archived', 'draft', 'published'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)

    const params = request.nextUrl.searchParams
    const pageIndex = parseInteger(params.get('pageIndex'), 0, 0, 10000)
    const pageSize = parseInteger(params.get('pageSize'), 20, 1, 48)
    const q = sanitizeMcpSearchTerm(params.get('q'))
    const category = params.get('category')?.trim() || ''
    const status = params.get('status') as McpStatus | null
    if (category && !(MCP_CATEGORIES as readonly string[]).includes(category))
      return NextResponse.json(responseMessage(null, 'MCP 分类无效', RESPONSE.ERROR), { status: 400 })
    if (status && !STATUSES.has(status))
      return NextResponse.json(responseMessage(null, 'MCP 状态无效', RESPONSE.ERROR), { status: 400 })

    const start = pageIndex * pageSize
    const { list, total } = await mcpRepository.list({
      category: category || undefined,
      limit: pageSize,
      offset: start,
      q: q || undefined,
      status,
    })
    return NextResponse.json(responseMessage({ list, page: pageIndex + 1, pageSize, total }), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, input] = await Promise.all([requireAdminSession(request.headers), readMcpJsonBody(request)])

    const mcp = sanitizeMcpAdminInput(input)
    const data = await mcpRepository.create(mcp, session.user)
    revalidateTag('mcps:public', 'max')
    revalidateTag(`mcp:${data.slug}`, 'max')
    if (data.publish_requested_at) {
      const queued = await createAssessmentJob({ actor: session.user, subjectId: data.id, subjectType: 'mcp', trigger: 'publish_gate' })
        .then(() => true)
        .catch(() => false)
      return NextResponse.json(responseMessage(data, queued ? 'MCP 已保存，安全检查通过后会自动发布' : 'MCP 已保存，安全检查暂未启动'), { status: 202, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(responseMessage(data, mcp.status === 'published' ? 'MCP 已发布' : 'MCP 草稿已保存'), { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof McpRepositoryError ? error.status : duplicate ? 409 : message.includes('64KB') ? 413 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'MCP 地址、Registry 名称或源地址已存在' : message, RESPONSE.ERROR), { status })
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error('分页参数无效')
  return number
}

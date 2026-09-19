import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { readMcpJsonBody, sanitizeMcpAdminInput } from '@/lib/mcps'
import { mcpRepository, McpRepositoryError } from '@/lib/repositories/mcps'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'MCP 参数无效', RESPONSE.ERROR), { status: 400 })
    const data = await mcpRepository.delete(id)
    if (!data)
      return NextResponse.json(responseMessage(null, 'MCP Server 不存在', RESPONSE.ERROR), { status: 404 })
    revalidateTag('mcps:public', 'max')
    revalidateTag(`mcp:${data.slug}`, 'max')
    return NextResponse.json(responseMessage(data, 'MCP Server 已删除'), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }] = await Promise.all([params, requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'MCP 参数无效', RESPONSE.ERROR), { status: 400 })
    const data = await mcpRepository.findById(id)
    if (!data)
      return NextResponse.json(responseMessage(null, 'MCP Server 不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status: 400 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input, session] = await Promise.all([params, readMcpJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, 'MCP 参数无效', RESPONSE.ERROR), { status: 400 })

    const current = await mcpRepository.findById(id)
    if (!current)
      return NextResponse.json(responseMessage(null, 'MCP Server 不存在', RESPONSE.ERROR), { status: 404 })
    const mcp = sanitizeMcpAdminInput(input)
    const expectedUpdatedAt = typeof input.expected_updated_at === 'string' ? input.expected_updated_at : undefined
    const data = await mcpRepository.update(id, mcp, session.user, current, expectedUpdatedAt)
    if (!data)
      return NextResponse.json(responseMessage(null, 'MCP Server 不存在', RESPONSE.ERROR), { status: 404 })
    revalidateTag('mcps:public', 'max')
    revalidateTag(`mcp:${current.slug}`, 'max')
    revalidateTag(`mcp:${data.slug}`, 'max')
    if (data.publish_requested_at) {
      const queued = await createAssessmentJob({ actor: session.user, subjectId: data.id, subjectType: 'mcp', trigger: 'publish_gate' })
        .then(() => true)
        .catch(() => false)
      return NextResponse.json(responseMessage(data, queued ? 'MCP 更新已保存，安全检查通过后会自动发布' : 'MCP 更新已保存，安全检查暂未启动'), { status: 202, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(responseMessage(data, mcp.status === 'published' ? 'MCP 更新已发布' : 'MCP 草稿已保存'), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof McpRepositoryError ? error.status : duplicate ? 409 : message.includes('64KB') ? 413 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'MCP 地址、Registry 名称或源地址已存在' : message, RESPONSE.ERROR), { status })
  }
}

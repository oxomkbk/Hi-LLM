import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { readMcpJsonBody, sanitizeMcpInput, sanitizeMcpSubmitter } from '@/lib/mcps'
import { McpSubmissionError, mcpSubmissionRepository } from '@/lib/repositories/mcp-submissions'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }] = await Promise.all([params, requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const data = await mcpSubmissionRepository.findById(id)
    if (!data)
      return NextResponse.json(responseMessage(null, '投稿不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const status = error instanceof McpSubmissionError ? error.status : 400
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([params, readMcpJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const current = await mcpSubmissionRepository.findById(id)
    if (!current)
      return NextResponse.json(responseMessage(null, '投稿不存在', RESPONSE.ERROR), { status: 404 })
    if (current.status === 'approved')
      return NextResponse.json(responseMessage(null, '已通过的投稿请在 MCP 内容中修改', RESPONSE.ERROR), { status: 409 })
    const mcp = sanitizeMcpInput(input)
    const submitter = sanitizeMcpSubmitter({
      submitter_email: input.submitter_email ?? current.submitter_email,
      submitter_name: input.submitter_name ?? current.submitter_name,
    }, mcp.publisher_name)
    const expectedUpdatedAt = typeof input.expected_updated_at === 'string' ? input.expected_updated_at : undefined
    const data = await mcpSubmissionRepository.update(id, mcp, submitter, expectedUpdatedAt)
    if (!data)
      return NextResponse.json(responseMessage(null, '投稿状态已变化', RESPONSE.ERROR), { status: 409 })
    return NextResponse.json(responseMessage(data, 'MCP 投稿修改成功'), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof McpSubmissionError ? error.status : duplicate ? 409 : message.includes('64KB') ? 413 : 400
    return NextResponse.json(
      responseMessage(null, duplicate ? 'MCP 地址、Registry 名称或源地址已存在' : message, RESPONSE.ERROR),
      { status },
    )
  }
}

import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { readMcpJsonBody, sanitizeMcpInput, sanitizeMcpReviewNote, sanitizeMcpSubmitter } from '@/lib/mcps'
import { McpSubmissionError, mcpSubmissionRepository } from '@/lib/repositories/mcp-submissions'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input, session] = await Promise.all([params, readMcpJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const actor = { email: session.user.email, id: session.user.id }
    if (input.action === 'approve') {
      const reviewNote = sanitizeMcpReviewNote(input.review_note)
      const edited = input.content && typeof input.content === 'object' && !Array.isArray(input.content)
        ? (() => {
            const content = input.content as Record<string, unknown>
            const mcp = sanitizeMcpInput(content)
            return {
              expectedUpdatedAt: typeof input.expected_updated_at === 'string' ? input.expected_updated_at : undefined,
              mcp,
              submitter: sanitizeMcpSubmitter(content, mcp.publisher_name),
            }
          })()
        : undefined
      const data = await mcpSubmissionRepository.approve(id, actor, edited, reviewNote)
      revalidateTag('mcps:public', 'max')
      revalidateTag(`mcp:${data.slug}`, 'max')
      return NextResponse.json(responseMessage(data, '审核通过，MCP Server 已发布'), { headers: { 'Cache-Control': 'no-store' } })
    }
    if (input.action === 'reject') {
      const note = sanitizeMcpReviewNote(input.review_note)
      if (!note)
        return NextResponse.json(responseMessage(null, '请填写拒绝原因', RESPONSE.ERROR), { status: 400 })
      const data = await mcpSubmissionRepository.reject(
        id,
        actor,
        note,
        typeof input.expected_updated_at === 'string' ? input.expected_updated_at : undefined,
      )
      if (!data)
        return NextResponse.json(responseMessage(null, '仅待审核投稿可以拒绝', RESPONSE.ERROR), { status: 409 })
      return NextResponse.json(responseMessage(data, '已拒绝该投稿'), { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(responseMessage(null, '审核操作无效', RESPONSE.ERROR), { status: 400 })
  }
  catch (error) {
    const message = (error as Error).message
    const duplicate = databaseErrorCode(error) === '23505'
    const status = error instanceof McpSubmissionError ? error.status : duplicate ? 409 : message.includes('64KB') ? 413 : 400
    return NextResponse.json(responseMessage(null, duplicate ? 'MCP 地址、Registry 名称或源地址已存在' : message, RESPONSE.ERROR), { status })
  }
}

import { NextResponse } from 'next/server'

import { AccessSettingsError, requireSubmissionAccess } from '@/lib/access-settings/service'
import { createSystemAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import {
  readMcpJsonBody,
  sanitizeMcpInput,
  sanitizeMcpSearchTerm,
  sanitizeMcpSubmitter,
} from '@/lib/mcps'
import { McpSubmissionError, mcpSubmissionRepository } from '@/lib/repositories/mcp-submissions'
import { assertSameOrigin, createSecurityHash, createTrustedVisitorHash } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { McpSubmissionStatus } from '@/types'
import type { NextRequest } from 'next/server'

const STATUSES = new Set<McpSubmissionStatus>(['approved', 'pending', 'pending_security', 'rejected'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const params = request.nextUrl.searchParams
    const pageIndex = parseInteger(params.get('pageIndex'), 0, 0, 10_000)
    const pageSize = parseInteger(params.get('pageSize'), 20, 1, 48)
    const q = sanitizeMcpSearchTerm(params.get('q'))
    const status = params.get('status') as McpSubmissionStatus | null
    if (status && !STATUSES.has(status))
      return NextResponse.json(responseMessage(null, '投稿状态无效', RESPONSE.ERROR), { status: 400 })
    const data = await mcpSubmissionRepository.list({
      limit: pageSize,
      offset: pageIndex * pageSize,
      q,
      status: status ?? undefined,
    })
    return NextResponse.json(responseMessage({ ...data, page: pageIndex + 1, pageSize }), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    return mcpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('mcp', request.headers)
    const input = await readMcpJsonBody(request)
    if (input.company)
      return NextResponse.json(responseMessage(null, '提交成功'))
    const startedAt = Number(input.form_started_at)
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2_500 || Date.now() - startedAt > 24 * 60 * 60 * 1_000)
      return NextResponse.json(responseMessage(null, '请完成表单后再提交', RESPONSE.ERROR), { status: 400 })

    const mcp = sanitizeMcpInput(input, { generateSlug: true })
    const submitter = sanitizeMcpSubmitter(input, mcp.publisher_name)
    const ipHash = createTrustedVisitorHash(request, 'mcp-submission-ip')
    const contactHash = createSecurityHash('mcp-submission-contact', submitter.submitter_email || submitter.submitter_name)
    const data = await mcpSubmissionRepository.create({ contactHash, ipHash, mcp, submitter })
    const assessment = await createSystemAssessmentJob({
      subjectId: data.id,
      subjectType: 'mcp_submission',
    }).catch(() => null)
    return NextResponse.json(responseMessage({
      id: data.id,
      security_scan_queued: Boolean(assessment),
    }, assessment
      ? '提交成功，安全检查已自动开始'
      : '提交成功，管理员审核后会出现在 MCP Directory'), { status: 201 })
  }
  catch (error) {
    return mcpError(error)
  }
}

function mcpError(error: unknown) {
  const message = (error as Error).message
  const status = error instanceof AccessSettingsError
    ? error.status
    : error instanceof McpSubmissionError
      ? error.status
      : databaseErrorCode(error) === '23505'
        ? 409
        : typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : message === '请求来源校验失败'
            ? 403
            : message.includes('64KB')
              ? 413
              : message.includes('安全网关')
                ? 503
                : 400
  const code = error instanceof AccessSettingsError ? error.code : 'MCP_SUBMISSION_FAILED'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { status },
  )
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error('分页参数无效')
  return number
}

import { readSecurityJsonBody, securityErrorResponse, SecurityHttpError, securitySuccess } from '@/lib/ai-security/http'
import { getSecurityWorkerControlSnapshot, requestSecurityWorkerControl } from '@/lib/ai-security/worker-control'
import { requireAdminSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'

import type { SecurityWorkerProcessAction } from '@/lib/ai-security/worker-process'
import type { NextRequest } from 'next/server'

const REQUEST_FIELDS = new Set(['action', 'confirmInterrupt'])

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    return securitySuccess(await getSecurityWorkerControlSnapshot())
  }
  catch (error) {
    return securityErrorResponse(error, '执行节点状态加载失败')
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
      throw invalidRequest()
    const [session, input] = await Promise.all([
      requireAdminSession(request.headers),
      readSecurityJsonBody(request),
    ])
    if (Object.keys(input).some(key => !REQUEST_FIELDS.has(key)))
      throw invalidRequest()
    const action = input.action
    if (action !== 'start' && action !== 'stop')
      throw invalidRequest()
    if (input.confirmInterrupt !== undefined && typeof input.confirmInterrupt !== 'boolean')
      throw invalidRequest()

    const result = await requestSecurityWorkerControl({
      action: action as SecurityWorkerProcessAction,
      confirmInterrupt: input.confirmInterrupt === true,
    }, session.user)
    const message = result.disposition === 'noop'
      ? action === 'start' ? '执行节点已在运行' : '执行节点已经关闭'
      : action === 'start' ? '启动请求已提交' : '关闭请求已提交'
    return securitySuccess(result, message, result.disposition === 'accepted' ? 202 : 200)
  }
  catch (error) {
    return securityErrorResponse(error, '执行节点控制失败')
  }
}

function invalidRequest() {
  return new SecurityHttpError('执行节点控制参数无效', 400, 'SECURITY_REQUEST_INVALID')
}

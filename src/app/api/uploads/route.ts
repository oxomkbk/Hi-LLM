import { NextResponse } from 'next/server'

import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireAdminSession, requireUserSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { uploadErrorResponse } from '@/lib/uploads/http'
import { assertUploadScope, assertUploadScopeFormat, isAdminUploadScope } from '@/lib/uploads/scope'
import { createUploadSession, UploadError } from '@/lib/uploads/service'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 64 * 1024)
      throw new UploadError('上传参数过大', 413, 'UPLOAD_REQUEST_TOO_LARGE')
    const input = await request.json() as {
      checksum?: string
      filename?: string
      mimeType?: string
      scope?: string
      size?: number
    }
    if (typeof input.scope !== 'string' || !input.scope.trim())
      throw new UploadError('上传用途无效', 400, 'UPLOAD_SCOPE_INVALID')
    const scope = input.scope.trim()
    assertUploadScopeFormat(scope)
    const session = isAdminUploadScope(scope)
      ? await requireAdminSession(request.headers)
      : await requireUserSession(request.headers)
    assertUploadScope(scope, session.user.role)
    if (scope === 'community-prompt-asset')
      await requireSubmissionAccess('prompt', request.headers)
    if (scope === 'community-skill-icon')
      await requireSubmissionAccess('skill', request.headers)
    if (scope === 'community-mcp-icon')
      await requireSubmissionAccess('mcp', request.headers)
    if (scope === 'wonderland-image')
      await requireSubmissionAccess('wonderland', request.headers)
    if (scope === 'wonderland-work-image')
      await requireSubmissionAccess('work', request.headers)
    const data = await createUploadSession({
      actor: { email: session.user.email, id: session.user.id, role: session.user.role },
      checksum: typeof input.checksum === 'string' ? input.checksum.slice(0, 256) : undefined,
      filename: typeof input.filename === 'string' ? input.filename : '',
      mimeType: typeof input.mimeType === 'string' ? input.mimeType : '',
      scope,
      size: Number(input.size),
    })
    return NextResponse.json(responseMessage(data, '上传任务已创建'), { status: 201 })
  }
  catch (error) {
    return uploadErrorResponse(error)
  }
}

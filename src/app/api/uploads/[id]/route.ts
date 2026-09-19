import { NextResponse } from 'next/server'

import { requireUserSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { uploadErrorResponse } from '@/lib/uploads/http'
import { cancelUploadSession, uploadStatus } from '@/lib/uploads/service'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const [session, { id }] = await Promise.all([requireUserSession(request.headers), params])
    return NextResponse.json(responseMessage(await cancelUploadSession(id, session.user.id), '上传任务已取消'))
  }
  catch (error) {
    return uploadErrorResponse(error)
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([requireUserSession(request.headers), params])
    return NextResponse.json(responseMessage(await uploadStatus(id, session.user.id, session.user.role)))
  }
  catch (error) {
    return uploadErrorResponse(error)
  }
}

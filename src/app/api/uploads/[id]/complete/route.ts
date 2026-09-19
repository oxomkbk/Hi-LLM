import { NextResponse } from 'next/server'

import { requireUserSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { uploadErrorResponse } from '@/lib/uploads/http'
import { completeUploadSession } from '@/lib/uploads/service'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const [session, { id }] = await Promise.all([requireUserSession(request.headers), params])
    const data = await completeUploadSession(id, session.user.id, session.user.role)
    return NextResponse.json(responseMessage(data, '文件上传完成'))
  }
  catch (error) {
    return uploadErrorResponse(error)
  }
}

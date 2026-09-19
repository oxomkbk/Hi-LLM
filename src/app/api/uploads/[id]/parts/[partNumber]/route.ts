import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { requireUserSession } from '@/lib/auth/session'
import { assertSameOrigin } from '@/lib/security'
import { uploadErrorResponse } from '@/lib/uploads/http'
import { UploadError, uploadSessionPart } from '@/lib/uploads/service'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, partNumber: string }> },
) {
  try {
    assertSameOrigin(request)
    const [session, { id, partNumber: rawPartNumber }] = await Promise.all([
      requireUserSession(request.headers),
      params,
    ])
    const contentLength = Number(request.headers.get('content-length'))
    const partNumber = Number(rawPartNumber)
    if (!request.body)
      throw new UploadError('缺少分片内容')
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
      throw new UploadError('必须提供准确的 Content-Length')

    const part = await uploadSessionPart({
      actorRole: session.user.role,
      body: Readable.fromWeb(request.body as unknown as import('node:stream/web').ReadableStream),
      contentLength,
      partNumber,
      sessionId: id,
      userId: session.user.id,
    })
    return NextResponse.json(responseMessage({
      etag: part.etag,
      partNumber: part.partNumber,
      size: part.size,
    }, `分片 ${part.partNumber} 上传成功`))
  }
  catch (error) {
    return uploadErrorResponse(error)
  }
}

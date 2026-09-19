import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { securityErrorResponse } from '@/lib/ai-security/http'
import { getRawAssessmentReportFile } from '@/lib/ai-security/service'
import { requireAdminSession } from '@/lib/auth/session'
import { isUuid } from '@/lib/security'
import { getStorageProviderByProfileId } from '@/lib/storage'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    void session
    if (!isUuid(id))
      throw Object.assign(new Error('评测编号无效'), { code: 'SECURITY_REQUEST_INVALID', status: 400 })
    const file = await getRawAssessmentReportFile(id)
    const provider = await getStorageProviderByProfileId(file.storage_profile_id)
    const stream = await provider.createReadStream({ key: file.object_key })
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
        'Content-Length': file.size_bytes,
        'Content-Security-Policy': `default-src 'none'`,
        'Content-Type': file.mime_type,
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  catch (error) {
    return securityErrorResponse(error, '原始报告读取失败')
  }
}

import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { AdminFileError, deleteAdminFile } from '@/lib/files/admin-service'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([
      requireAdminSession(request.headers),
      params,
    ])
    if (!isUuid(id))
      throw new AdminFileError('文件参数无效')
    const data = await deleteAdminFile(id, session.user.id)
    return NextResponse.json(responseMessage(data, '文件已删除'), { headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) {
    const status = error instanceof AdminFileError
      ? error.status
      : typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 500
    const message = error instanceof Error ? error.message : '文件删除失败'
    return NextResponse.json(responseMessage(null, message, RESPONSE.ERROR), { status })
  }
}

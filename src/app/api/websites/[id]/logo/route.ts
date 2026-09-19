import { Buffer } from 'node:buffer'

import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import {
  completeSmallFileUpload,
  deleteFileObject,
  failSmallFileUpload,
  fileToken,
  storeSmallFile,
} from '@/lib/files/service'
import { catalogRepository } from '@/lib/repositories/catalog'
import { isUuid, validateLogoFile } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let newFileId: string | null = null
  let uploadSessionId: string | null = null
  try {
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '网站参数无效', RESPONSE.ERROR), { status: 400 })

    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 2 * 1024 * 1024)
      return NextResponse.json(responseMessage(null, 'Logo 上传内容过大', RESPONSE.ERROR), { status: 413 })

    const current = await catalogRepository.findWebsiteById(id)
    if (!current)
      return NextResponse.json(responseMessage(null, '网站不存在', RESPONSE.ERROR), { status: 404 })

    const formData = await request.formData()
    const { extension, file } = await validateLogoFile(formData.get('file'))
    const stored = await storeSmallFile({
      actor: { email: session.user.email, id: session.user.id },
      body: Buffer.from(await file.arrayBuffer()),
      extension,
      mimeType: file.type,
      originalName: file.name,
      scope: 'website-logo',
      visibility: 'public',
    })
    newFileId = stored.id
    uploadSessionId = stored.infrastructureUploadSessionId

    const data = await catalogRepository.updateWebsiteLogo(id, fileToken(stored.id), stored.id)
    if (!data)
      throw new Error('网站 Logo 更新失败')
    await completeSmallFileUpload(uploadSessionId).catch(() => undefined)
    uploadSessionId = null

    if (current.logo_file_id && current.logo_file_id !== stored.id)
      await deleteFileObject(current.logo_file_id).catch(() => undefined)
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    if (newFileId)
      await deleteFileObject(newFileId).catch(() => undefined)
    if (uploadSessionId)
      await failSmallFileUpload(uploadSessionId).catch(() => undefined)
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 400
    return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
  }
}

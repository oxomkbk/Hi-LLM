import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { deleteFileObject } from '@/lib/files/service'
import { catalogRepository } from '@/lib/repositories/catalog'
import { isUuid, sanitizeWebsiteInput } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { WebsiteSaveParams } from '@/types'
import type { NextRequest } from 'next/server'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('网站参数无效')
    const data = await catalogRepository.deleteWebsite(id)
    if (!data)
      return NextResponse.json(responseMessage(null, '网站不存在', RESPONSE.ERROR), { status: 404 })
    if (data.logo_file_id)
      await deleteFileObject(data.logo_file_id).catch(() => undefined)
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('网站参数无效')
    const input = sanitizeWebsiteInput(await request.json(), true) as WebsiteSaveParams
    const data = await catalogRepository.updateWebsite(id, { ...input, logo: null })
    if (!data)
      return NextResponse.json(responseMessage(null, '网站不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      return NextResponse.json(responseMessage(null, '网站名称或链接已存在！', RESPONSE.ERROR), { status: 409 })
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 400
  return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
}

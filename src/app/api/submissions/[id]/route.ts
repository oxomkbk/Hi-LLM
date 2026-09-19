import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { websiteSubmissionRepository } from '@/lib/repositories/website-submissions'
import { isUuid, sanitizeWebsiteInput } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body] = await Promise.all([
      params,
      request.json() as Promise<Record<string, unknown>>,
      requireAdminSession(request.headers),
    ])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })

    const data = await websiteSubmissionRepository.update(id, sanitizeWebsiteInput(body, true))
    if (!data)
      return NextResponse.json(responseMessage(null, '投稿不存在或已经审核通过', RESPONSE.ERROR), { status: 409 })
    return NextResponse.json(responseMessage(data, '修改成功'))
  }
  catch (error) {
    const duplicate = databaseErrorCode(error) === '23505'
    return NextResponse.json(
      responseMessage(null, duplicate ? '网站链接已存在' : (error as Error).message, RESPONSE.ERROR),
      { status: duplicate ? 409 : 400 },
    )
  }
}

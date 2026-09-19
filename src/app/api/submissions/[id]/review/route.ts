import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { websiteSubmissionRepository } from '@/lib/repositories/website-submissions'
import { isUuid, stripControlCharacters } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body, session] = await Promise.all([
      params,
      request.json() as Promise<{ action?: unknown, note?: unknown }>,
      requireAdminSession(request.headers),
    ])
    if (!isUuid(id))
      return NextResponse.json(responseMessage(null, '投稿参数无效', RESPONSE.ERROR), { status: 400 })
    const actor = { email: session.user.email, id: session.user.id }

    if (body.action === 'approve') {
      const data = await websiteSubmissionRepository.approve(id, actor)
      return NextResponse.json(responseMessage(data, '审核通过，网站已发布'))
    }
    if (body.action === 'reject') {
      const note = typeof body.note === 'string'
        ? stripControlCharacters(body.note).trim().slice(0, 300)
        : ''
      const data = await websiteSubmissionRepository.reject(id, actor, note)
      if (!data)
        return NextResponse.json(responseMessage(null, '投稿不存在或已经审核通过', RESPONSE.ERROR), { status: 409 })
      return NextResponse.json(responseMessage(data, '已拒绝该投稿'))
    }
    return NextResponse.json(responseMessage(null, '审核操作无效', RESPONSE.ERROR), { status: 400 })
  }
  catch (error) {
    const duplicate = databaseErrorCode(error) === '23505'
    return NextResponse.json(
      responseMessage(null, duplicate ? '网站名称或链接已存在' : (error as Error).message, RESPONSE.ERROR),
      { status: duplicate ? 409 : 400 },
    )
  }
}

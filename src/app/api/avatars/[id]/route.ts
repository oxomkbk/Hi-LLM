import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { getControlPool } from '@/lib/db/control'
import { parseSingleRange, RangeNotSatisfiableError } from '@/lib/files/range'
import { allowFileRead } from '@/lib/files/read-rate-limit'
import { createFileReadIdentity, isUuid } from '@/lib/security'
import { getStorageProviderByProfileId } from '@/lib/storage'
import { StorageNotFoundError } from '@/lib/storage/types'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

interface PublicAvatarRow {
  mime_type: string
  object_key: string
  original_name: string
  size_bytes: string
  storage_profile_id: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id))
    return avatarError('头像编号无效', 400)

  try {
    const identity = createFileReadIdentity(request)
    if (!allowFileRead(identity))
      return avatarError('头像访问过于频繁', 429, { 'Retry-After': '60' })

    const result = await getControlPool().query<PublicAvatarRow>(`
      select
        avatar.storage_profile_id,
        avatar.object_key,
        avatar.original_name,
        avatar.size_bytes,
        avatar.mime_type
      from control.user_avatar_files avatar
      join auth."user" account
        on account."avatarFileId" = avatar.id
       and account.id = avatar.owner_user_id
      where avatar.id = $1::uuid
        and avatar.status = 'ready'
        and account.status = 'active'
    `, [id])
    const avatar = result.rows[0]
    if (!avatar)
      return avatarError('头像不存在', 404)

    const size = Number(avatar.size_bytes)
    const range = parseSingleRange(request.headers.get('range'), size)
    const provider = await getStorageProviderByProfileId(avatar.storage_profile_id)
    const metadata = await provider.headObject(avatar.object_key)
    const stream = await provider.createReadStream({
      end: range?.end,
      key: avatar.object_key,
      start: range?.start,
    })
    const contentLength = range ? range.end - range.start + 1 : metadata.size
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(avatar.original_name)}`,
      'Content-Length': String(contentLength),
      'Content-Type': avatar.mime_type,
      'X-Content-Type-Options': 'nosniff',
    })
    if (range)
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers,
      status: range ? 206 : 200,
    })
  }
  catch (error) {
    if (error instanceof RangeNotSatisfiableError)
      return avatarError(error.message, 416, { 'Content-Range': `bytes */${error.size}` })
    if (error instanceof StorageNotFoundError)
      return avatarError('头像对象不存在', 404)
    console.error('头像读取失败', error instanceof Error ? { message: error.message, name: error.name } : { type: typeof error })
    return avatarError('头像读取失败', 500)
  }
}

function avatarError(message: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...extraHeaders },
  })
}

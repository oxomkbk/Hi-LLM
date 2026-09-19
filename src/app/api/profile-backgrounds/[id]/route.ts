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

interface PublicBackgroundRow {
  mime_type: string
  object_key: string
  original_name: string
  size_bytes: string
  storage_profile_id: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id))
    return backgroundError('背景图片编号无效', 400)

  try {
    const identity = createFileReadIdentity(request)
    if (!allowFileRead(identity))
      return backgroundError('背景图片访问过于频繁', 429, { 'Retry-After': '60' })

    const result = await getControlPool().query<PublicBackgroundRow>(`
      select
        background.storage_profile_id,
        background.object_key,
        background.original_name,
        background.size_bytes,
        background.mime_type
      from control.user_profile_background_files background
      join control.user_profile_appearances appearance
        on appearance.background_file_id = background.id
      join auth."user" account
        on account.id = appearance.user_id
       and account.id = background.owner_user_id
      where background.id = $1::uuid
        and background.status = 'ready'
        and account.status = 'active'
    `, [id])
    const background = result.rows[0]
    if (!background)
      return backgroundError('背景图片不存在', 404)

    const size = Number(background.size_bytes)
    const range = parseSingleRange(request.headers.get('range'), size)
    const provider = await getStorageProviderByProfileId(background.storage_profile_id)
    const metadata = await provider.headObject(background.object_key)
    const stream = await provider.createReadStream({
      end: range?.end,
      key: background.object_key,
      start: range?.start,
    })
    const contentLength = range ? range.end - range.start + 1 : metadata.size
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(background.original_name)}`,
      'Content-Length': String(contentLength),
      'Content-Type': background.mime_type,
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
      return backgroundError(error.message, 416, { 'Content-Range': `bytes */${error.size}` })
    if (error instanceof StorageNotFoundError)
      return backgroundError('背景图片对象不存在', 404)
    console.error('背景图片读取失败', error instanceof Error ? { message: error.message, name: error.name } : { type: typeof error })
    return backgroundError('背景图片读取失败', 500)
  }
}

function backgroundError(message: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...extraHeaders },
  })
}

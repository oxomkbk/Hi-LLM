import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { parseSingleRange, RangeNotSatisfiableError } from '@/lib/files/range'
import { allowFileRead } from '@/lib/files/read-rate-limit'
import { promptRepository } from '@/lib/repositories/prompts'
import { createFileReadIdentity, isUuid } from '@/lib/security'
import { getStorageProviderByProfileId } from '@/lib/storage'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string, slug: string }> }) {
  const { assetId, slug } = await params
  if (!isUuid(assetId))
    return NextResponse.json({ message: '资源编号无效' }, { status: 400 })
  try {
    if (!allowFileRead(createFileReadIdentity(request)))
      return NextResponse.json({ message: '资源访问过于频繁' }, { status: 429, headers: { 'Retry-After': '60' } })
    const file = await promptRepository.findPublicAsset(slug, assetId)
    if (!file)
      return NextResponse.json({ message: '资源不存在' }, { status: 404 })
    const size = Number(file.size_bytes)
    const range = parseSingleRange(request.headers.get('range'), size)
    const provider = await getStorageProviderByProfileId(file.storage_profile_id)
    const stream = await provider.createReadStream({ end: range?.end, key: file.object_key, start: range?.start })
    const download = request.nextUrl.searchParams.get('download') === '1' && file.is_downloadable
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Length': String(range ? range.end - range.start + 1 : size),
      'Content-Security-Policy': file.role === 'web_preview' ? 'sandbox; default-src \'none\'; img-src \'self\' data:; media-src \'self\'; style-src \'unsafe-inline\'; font-src \'self\'; script-src \'none\'; connect-src \'none\'; frame-ancestors \'self\'' : 'default-src \'none\'',
      'Content-Type': file.mime_type,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    })
    if (range)
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { headers, status: range ? 206 : 200 })
  }
  catch (error) {
    if (error instanceof RangeNotSatisfiableError)
      return NextResponse.json({ message: error.message }, { status: 416, headers: { 'Content-Range': `bytes */${error.size}` } })
    return NextResponse.json({ message: '资源读取失败' }, { status: 500 })
  }
}

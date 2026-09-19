import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { getServerSession } from '@/lib/auth/session'
import { parseSingleRange, RangeNotSatisfiableError } from '@/lib/files/range'
import { allowFileRead } from '@/lib/files/read-rate-limit'
import { fileRepository } from '@/lib/repositories/files'
import { createFileReadIdentity, isUuid } from '@/lib/security'
import { getStorageProviderByProfileId } from '@/lib/storage'
import { StorageNotFoundError } from '@/lib/storage/types'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id))
    return NextResponse.json({ message: '文件编号无效' }, { status: 400 })

  try {
    const identity = createFileReadIdentity(request)
    if (!allowFileRead(identity))
      return NextResponse.json({ message: '文件访问过于频繁' }, { status: 429, headers: { 'Retry-After': '60' } })

    const file = await fileRepository.findById(id)
    if (!file || file.status !== 'ready')
      return NextResponse.json({ message: '文件不存在' }, { status: 404 })

    let isPublicReferencedFile = false
    if (file.visibility === 'private') {
      isPublicReferencedFile = await fileRepository.isPublicContentReference(id)
      if (!isPublicReferencedFile) {
        const session = await getServerSession(request.headers)
        const canRead = session?.user.status === 'active'
          && (session.user.role === 'admin' || session.user.id === file.owner_id)
        if (!canRead)
          return NextResponse.json({ message: '无权访问该文件' }, { status: session ? 403 : 401 })
      }
    }

    const size = Number(file.size_bytes)
    const range = parseSingleRange(request.headers.get('range'), size)
    const provider = await getStorageProviderByProfileId(file.storage_profile_id)
    const metadata = await provider.headObject(file.object_key)

    const isInlineImage = file.mime_type.startsWith('image/')
    const isPublicRead = file.visibility === 'public' || isPublicReferencedFile
    if (!range && isPublicRead && !isInlineImage) {
      const signedUrl = await provider.createReadUrl({ expiresInSeconds: 120, key: file.object_key })
      if (signedUrl)
        return NextResponse.redirect(signedUrl, { status: 307 })
    }

    const stream = await provider.createReadStream({
      end: range?.end,
      key: file.object_key,
      start: range?.start,
    })

    const contentLength = range ? range.end - range.start + 1 : metadata.size
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': isPublicRead ? 'public, max-age=300, stale-while-revalidate=86400' : 'private, no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'Content-Length': String(contentLength),
      'Content-Type': file.mime_type,
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
    if (error instanceof RangeNotSatisfiableError) {
      return NextResponse.json(
        { message: error.message },
        { status: 416, headers: { 'Content-Range': `bytes */${error.size}` } },
      )
    }
    if (error instanceof StorageNotFoundError)
      return NextResponse.json({ message: '文件对象不存在' }, { status: 404 })
    console.error('文件读取失败', error instanceof Error ? { message: error.message, name: error.name } : { type: typeof error })
    return NextResponse.json({ message: '文件读取失败' }, { status: 500 })
  }
}

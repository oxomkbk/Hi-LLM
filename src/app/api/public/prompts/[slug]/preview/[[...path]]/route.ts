import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

import { allowFileRead } from '@/lib/files/read-rate-limit'
import { promptRepository } from '@/lib/repositories/prompts'
import { createFileReadIdentity } from '@/lib/security'
import { getStorageProviderByProfileId } from '@/lib/storage'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[], slug: string }> }) {
  try {
    if (!allowFileRead(createFileReadIdentity(request)))
      return NextResponse.json({ message: '预览访问过于频繁' }, { status: 429, headers: { 'Retry-After': '60' } })
    const values = await params
    const sourcePath = values.path?.join('/')
    if (sourcePath?.split('/').some(segment => !segment || segment === '.' || segment === '..'))
      return NextResponse.json({ message: '预览路径无效' }, { status: 400 })
    const file = await promptRepository.findPublicPreviewAsset(values.slug, sourcePath)
    if (!file)
      return NextResponse.json({ message: '预览资源不存在' }, { status: 404 })
    const provider = await getStorageProviderByProfileId(file.storage_profile_id)
    const stream = await provider.createReadStream({ key: file.object_key })
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Content-Length': file.size_bytes,
        'Content-Security-Policy': 'sandbox; default-src \'self\' data:; img-src \'self\' data:; media-src \'self\'; style-src \'self\' \'unsafe-inline\'; font-src \'self\'; script-src \'none\'; connect-src \'none\'; frame-ancestors \'self\'',
        'Content-Type': file.mime_type,
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  catch {
    return NextResponse.json({ message: '预览读取失败' }, { status: 500 })
  }
}

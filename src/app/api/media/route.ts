import { NextResponse } from 'next/server'

import { requireUserSession } from '@/lib/auth/session'
import { listMediaLibrary } from '@/lib/files/media-library-service'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { MediaLibraryKind } from '@/lib/files/media-library-service'
import type { NextRequest } from 'next/server'

const KINDS = new Set<MediaLibraryKind>(['all', 'image', 'video'])

export async function GET(request: NextRequest) {
  try {
    const session = await requireUserSession(request.headers)
    const params = request.nextUrl.searchParams
    const kind = params.get('kind')?.trim() || 'all'
    if (!KINDS.has(kind as MediaLibraryKind))
      throw Object.assign(new Error('素材类型无效'), { status: 400 })
    const data = await listMediaLibrary({
      actorId: session.user.id,
      actorRole: session.user.role,
      kind: kind as MediaLibraryKind,
      page: integer(params.get('page'), 1, 1, 100_000),
      pageSize: integer(params.get('pageSize'), 24, 1, 60),
      q: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    })
    return NextResponse.json(responseMessage(data), { headers: { 'Cache-Control': 'private, no-store' } })
  }
  catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
    return NextResponse.json(
      responseMessage(null, error instanceof Error ? error.message : '素材加载失败', RESPONSE.ERROR),
      { status },
    )
  }
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  if (!value)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw Object.assign(new Error('分页参数无效'), { status: 400 })
  return parsed
}

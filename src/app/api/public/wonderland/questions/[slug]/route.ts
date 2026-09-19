import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'
import { findPublicQuestionBySlug } from '@/lib/wonderland/repositories/community'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const data = await findPublicQuestionBySlug(slug.slice(0, 100))
    if (!data)
      return NextResponse.json(responseMessage(null, '问题不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data), {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    })
  }
  catch (error) {
    console.error('妙妙屋问题详情加载失败', error instanceof Error ? { message: error.message } : { type: typeof error })
    return NextResponse.json(responseMessage(null, '问题详情暂时无法加载', RESPONSE.ERROR), { status: 500 })
  }
}

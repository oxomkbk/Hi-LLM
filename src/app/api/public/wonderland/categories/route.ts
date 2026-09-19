import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'
import { listPublicQuestionCategories } from '@/lib/wonderland/repositories/community'

export async function GET() {
  try {
    const data = await listPublicQuestionCategories()
    return NextResponse.json(responseMessage(data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  }
  catch {
    return NextResponse.json(responseMessage(null, '分类暂时无法加载', RESPONSE.ERROR), { status: 500 })
  }
}

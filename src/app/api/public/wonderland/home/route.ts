import { NextResponse } from 'next/server'

import { RESPONSE, responseMessage } from '@/lib/utils'
import { getWonderlandPortal } from '@/lib/wonderland/repositories/community'

export async function GET() {
  try {
    const data = await getWonderlandPortal()
    return NextResponse.json(responseMessage(data), {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    })
  }
  catch (error) {
    console.error('妙妙屋门户加载失败', error instanceof Error ? { message: error.message } : { type: typeof error })
    return NextResponse.json(responseMessage(null, '妙妙屋暂时无法加载', RESPONSE.ERROR), { status: 500 })
  }
}

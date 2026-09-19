import { NextResponse } from 'next/server'

import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { responseMessage } from '@/lib/utils'

export async function GET() {
  const settings = await getPublicSiteAccessSettings()
  return NextResponse.json(responseMessage(settings), {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}

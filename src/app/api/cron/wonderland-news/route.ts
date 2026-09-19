import { NextResponse } from 'next/server'

import { publishScheduledWonderNews } from '@/lib/wonderland/services/admin'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ message: '无权执行定时任务' }, { status: 401 })
  const data = await publishScheduledWonderNews()
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

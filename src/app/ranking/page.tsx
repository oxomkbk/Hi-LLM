import RankingBoard from './ranking-board'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `热门网站排行榜 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '按有效访问次数排列的热门网站 Top 30。',
}

export default function RankingPage() {
  return <RankingBoard />
}

import HomeDirectory from './home-directory'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    absolute: 'HiLLM | 发现、收藏并分享值得访问的 AI 工具',
  },
}

export default function Home() {
  return <HomeDirectory />
}

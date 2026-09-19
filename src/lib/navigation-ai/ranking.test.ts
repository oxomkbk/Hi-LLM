import { describe, expect, it } from 'vitest'

import { scoreNavigationCandidates, selectNavigationCandidates } from './ranking'

import type { NavigationAiCandidate } from './types'

const sites: NavigationAiCandidate[] = [
  {
    categories: ['AI 视频创作'],
    commonlyUsed: false,
    description: '用文本快速生成短视频，支持中文提示词。',
    id: 'video',
    logo: null,
    name: '视频工坊',
    pinned: false,
    recommend: true,
    tags: ['文生视频', '短视频'],
    url: 'https://video.example.com',
    visitCount: 8,
    vpn: false,
  },
  {
    categories: ['AI 写作'],
    commonlyUsed: true,
    description: '长文写作与润色。',
    id: 'writer',
    logo: null,
    name: '写作助手',
    pinned: true,
    recommend: true,
    tags: ['写作'],
    url: 'https://writer.example.com',
    visitCount: 10_000,
    vpn: false,
  },
]

describe('navigation AI candidate ranking', () => {
  it('prioritizes relevance over raw popularity', () => {
    const ranked = scoreNavigationCandidates(sites, {
      categories: ['AI 视频创作'],
      constraints: ['中文'],
      keywords: ['视频', '短视频'],
    }, '我要一个能生成中文短视频的网站')

    expect(ranked[0]?.site.id).toBe('video')
    expect(ranked[0]!.matchScore).toBeGreaterThan(ranked[1]!.matchScore)
  })

  it('falls back to popular curated entries when nothing matches', () => {
    const ranked = scoreNavigationCandidates(sites, {
      categories: [],
      constraints: [],
      keywords: ['量子天气'],
    }, '量子天气')

    expect(selectNavigationCandidates(ranked)[0]?.site.id).toBe('writer')
  })
})

import { describe, expect, it } from 'vitest'

import {
  decorateRankingWebsites,
  formatRankingPosition,
  getRankingMovement,
  getRankingScrollState,
  getRankingStrength,
  isRankingPeriod,
  RANKING_PAGE_CONTENT,
} from './rankings'

import type { RankedWebsite } from '@/types'

function rankedWebsite(overrides: Partial<RankedWebsite>): RankedWebsite {
  return {
    badges: [],
    categories: [],
    currentVisits: 10,
    desc: null,
    growthRate: 25,
    id: crypto.randomUUID(),
    logo: null,
    name: '测试站点',
    previousRank: 2,
    previousVisits: 8,
    rank: 1,
    rankDelta: 1,
    tags: [],
    url: 'https://example.com',
    visitCount: 100,
    visitDelta: 2,
    vpn: false,
    ...overrides,
  }
}

describe('ranking period validation', () => {
  it('only accepts supported periods', () => {
    expect(isRankingPeriod('week')).toBe(true)
    expect(isRankingPeriod('quarter')).toBe(false)
  })
})

describe('ranking badges', () => {
  it('awards streak and growth king from real comparison metrics', () => {
    const champion = rankedWebsite({ previousRank: 1, rank: 1, rankDelta: 0, visitDelta: 8 })
    const runnerUp = rankedWebsite({ id: crypto.randomUUID(), rank: 2, rankDelta: 1, visitDelta: 3 })
    const result = decorateRankingWebsites([champion, runnerUp], 'week')

    expect(result[0]?.badges).toEqual(['streak', 'growth_king'])
    expect(result[1]?.badges).toEqual([])
  })

  it('marks a genuine new top-ten entry as a dark horse', () => {
    const newcomer = rankedWebsite({ currentVisits: 4, previousRank: null, previousVisits: 0, rank: 6, rankDelta: null, visitDelta: 4 })
    const result = decorateRankingWebsites([newcomer], 'month')

    expect(result[0]?.badges).toContain('dark_horse')
  })

  it('does not invent trend badges for the all-time ranking', () => {
    const result = decorateRankingWebsites([rankedWebsite({ badges: ['dark_horse'] })], 'all')
    expect(result[0]?.badges).toEqual([])
  })
})

describe('ranking presentation metrics', () => {
  it('uses ranking-first page copy', () => {
    expect(RANKING_PAGE_CONTENT).toEqual({
      description: '基于真实有效访问，记录 AI 工具的热度变化与排名竞争。',
      eyebrow: 'AI 热度榜',
      listTitle: '完整榜单',
      podiumTitle: '本期领先席位',
      title: 'AI 网站热度排行榜',
    })
  })

  it('formats ranking positions without losing the ordinal shape', () => {
    expect(formatRankingPosition(1)).toBe('01')
    expect(formatRankingPosition(12)).toBe('12')
    expect(formatRankingPosition(123)).toBe('123')
  })

  it('describes movement consistently for live ranking periods', () => {
    expect(getRankingMovement('week', { currentVisits: 20, previousRank: 8, rankDelta: 3 })).toEqual({
      amount: 3,
      kind: 'up',
      label: '上升 3',
    })
    expect(getRankingMovement('week', { currentVisits: 20, previousRank: 8, rankDelta: -2 })).toEqual({
      amount: 2,
      kind: 'down',
      label: '下降 2',
    })
    expect(getRankingMovement('week', { currentVisits: 20, previousRank: null, rankDelta: null })).toEqual({
      amount: null,
      kind: 'new',
      label: '新上榜',
    })
  })

  it('uses all-time and relative-strength states without inventing a trend', () => {
    expect(getRankingMovement('all', { currentVisits: 20, previousRank: 8, rankDelta: 3 })).toEqual({
      amount: null,
      kind: 'all-time',
      label: '累计',
    })
    expect(getRankingStrength(100, 46)).toBe(46)
    expect(getRankingStrength(0, 46)).toBe(0)
  })

  it('derives category scroll affordances at the edges only', () => {
    expect(getRankingScrollState(0, 300, 300)).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
      hasOverflow: false,
    })
    expect(getRankingScrollState(0, 300, 600)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
      hasOverflow: true,
    })
    expect(getRankingScrollState(120, 300, 600)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
      hasOverflow: true,
    })
    expect(getRankingScrollState(296, 300, 600)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
      hasOverflow: true,
    })
  })
})

import type { RankedWebsite, RankingBadgeKind, RankingPeriod } from '@/types'

export const RANKING_PERIOD_OPTIONS = [
  { label: '今日', value: 'day' },
  { label: '近 7 天', value: 'week' },
  { label: '近 30 天', value: 'month' },
  { label: '总榜', value: 'all' },
] as const satisfies ReadonlyArray<{ label: string, value: RankingPeriod }>

export const RANKING_PERIOD_LABELS: Record<RankingPeriod, string> = {
  all: '累计总榜',
  day: '今日榜单',
  month: '近 30 天',
  week: '近 7 天',
}

export const RANKING_PAGE_CONTENT = {
  description: '基于真实有效访问，记录 AI 工具的热度变化与排名竞争。',
  eyebrow: 'AI 热度榜',
  listTitle: '完整榜单',
  podiumTitle: '本期领先席位',
  title: 'AI 网站热度排行榜',
} as const

export interface RankingMovement {
  amount: number | null
  kind: 'all-time' | 'down' | 'flat' | 'new' | 'up' | 'empty'
  label: string
}

export interface RankingScrollState {
  canScrollLeft: boolean
  canScrollRight: boolean
  hasOverflow: boolean
}

export function decorateRankingWebsites(websites: RankedWebsite[], period: RankingPeriod): RankedWebsite[] {
  if (period === 'all')
    return websites.map(website => ({ ...website, badges: [] }))

  const growthKing = websites
    .filter(website => Number(website.visitDelta) > 0)
    .toSorted((left, right) => (
      Number(right.visitDelta) - Number(left.visitDelta)
      || Number(right.growthRate ?? -1) - Number(left.growthRate ?? -1)
      || left.rank - right.rank
    ))[0]

  return websites.map((website) => {
    const badges: RankingBadgeKind[] = []
    const isNewEntry = website.currentVisits > 0 && website.previousRank === null
    const isDarkHorse = website.rank <= 10 && (
      (website.rankDelta ?? 0) >= 5
      || isNewEntry
    )

    if (website.rank === 1 && website.previousRank === 1)
      badges.push('streak')

    if (growthKing?.id === website.id)
      badges.push('growth_king')

    if (isDarkHorse)
      badges.push('dark_horse')
    else if (isNewEntry)
      badges.push('new_entry')

    return { ...website, badges }
  })
}

export function formatRankingPosition(rank: number) {
  if (!Number.isFinite(rank) || rank < 1)
    return '—'

  return String(Math.trunc(rank)).padStart(2, '0')
}

export function getRankingMovement(
  period: RankingPeriod,
  site: Pick<RankedWebsite, 'currentVisits' | 'previousRank' | 'rankDelta'>,
): RankingMovement {
  if (period === 'all') {
    return { amount: null, kind: 'all-time', label: '累计' }
  }

  if (site.currentVisits <= 0 && site.previousRank === null) {
    return { amount: null, kind: 'empty', label: '—' }
  }

  if (site.previousRank === null) {
    return { amount: null, kind: 'new', label: '新上榜' }
  }

  const rankDelta = Number(site.rankDelta ?? 0)
  if (rankDelta > 0) {
    return { amount: rankDelta, kind: 'up', label: `上升 ${rankDelta}` }
  }

  if (rankDelta < 0) {
    const amount = Math.abs(rankDelta)
    return { amount, kind: 'down', label: `下降 ${amount}` }
  }

  return { amount: 0, kind: 'flat', label: '持平' }
}

export function getRankingScrollState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  edgeEpsilon = 4,
): RankingScrollState {
  const hasOverflow = scrollWidth - clientWidth > edgeEpsilon

  return {
    canScrollLeft: hasOverflow && scrollLeft > edgeEpsilon,
    canScrollRight: hasOverflow && scrollLeft + clientWidth < scrollWidth - edgeEpsilon,
    hasOverflow,
  }
}

export function getRankingStrength(championVisits: number, currentVisits: number) {
  if (championVisits <= 0 || currentVisits <= 0)
    return 0

  return Math.max(0, Math.min(100, Math.round(currentVisits / championVisits * 100)))
}

export function isRankingPeriod(value: unknown): value is RankingPeriod {
  return RANKING_PERIOD_OPTIONS.some(option => option.value === value)
}

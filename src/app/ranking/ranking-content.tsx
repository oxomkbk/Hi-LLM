'use client'

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChartLineArrowUp,
  CrownDiamond,
  Sparkles,
  Thunderbolt,
} from '@gravity-ui/icons'
import { Chip, Skeleton } from '@heroui/react'
import Image from 'next/image'

import {
  formatRankingPosition,
  getRankingMovement,
  getRankingStrength,
  RANKING_PAGE_CONTENT,
} from '@/lib/rankings'
import { generateLogoUrl } from '@/lib/utils'
import { recordWebsiteVisit } from '@/lib/website-visit'

import type {
  RankedWebsite,
  RankingBadgeKind,
  RankingData,
  RankingPeriod,
} from '@/types'

const BADGE_META = {
  dark_horse: { color: 'accent', icon: Thunderbolt, label: '黑马' },
  growth_king: { color: 'success', icon: ChartLineArrowUp, label: '增长王' },
  new_entry: { color: 'default', icon: Sparkles, label: '新上榜' },
  streak: { color: 'warning', icon: CrownDiamond, label: '连冠' },
} as const satisfies Record<RankingBadgeKind, {
  color: 'accent' | 'default' | 'success' | 'warning'
  icon: typeof CrownDiamond
  label: string
}>

const PODIUM_META = [
  { label: '冠军', status: '当前榜首' },
  { label: '亚军', status: '紧随其后' },
  { label: '季军', status: '紧随其后' },
] as const

export function RankingList({ data }: { data: RankingData }) {
  const websites = data.websites.slice(3)
  if (!websites.length)
    return null

  const maxVisits = Math.max(1, data.websites[0]?.currentVisits ?? 0)

  return (
    <section aria-labelledby="ranking-list-title" className="ranking-list">
      <div className="ranking-list-heading">
        <div>
          <span>其余席位</span>
          <h2 id="ranking-list-title">{RANKING_PAGE_CONTENT.listTitle}</h2>
          <p>
            第 4—
            {String(data.websites.length).padStart(2, '0')}
            {' '}
            名 ·
            {' '}
            {data.periodLabel}
          </p>
        </div>
        <Chip size="sm" variant="soft" className="ranking-list-count">
          {data.websites.length}
          {' '}
          个站点
        </Chip>
      </div>

      <div className="ranking-table-scroll">
        <table className="ranking-table">
          <thead>
            <tr>
              <th scope="col">名次</th>
              <th scope="col">网站</th>
              <th scope="col">趋势</th>
              <th scope="col" className="is-numeric">有效访问</th>
              <th scope="col" className="ranking-heat-column">相对热度</th>
              <th scope="col"><span className="sr-only">打开网站</span></th>
            </tr>
          </thead>
          <tbody>
            {websites.map((site) => {
              const strength = Math.max(3, getRankingStrength(maxVisits, site.currentVisits))
              return (
                <tr key={site.id}>
                  <td><span className="ranking-row-rank">{formatRankingPosition(site.rank)}</span></td>
                  <td>
                    <a
                      href={site.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={() => recordWebsiteVisit(site.id)}
                      className="ranking-table-site"
                    >
                      <SiteLogo size="size-10" site={site} />
                      <span className="ranking-row-main">
                        <span className="ranking-row-title">
                          <strong>{site.name}</strong>
                          {site.badges.slice(0, 1).map(badge => <RankingBadge key={badge} badge={badge} />)}
                        </span>
                        <span className="ranking-row-context">
                          {site.categories.slice(0, 2).map(category => <i key={category.id}>{category.name}</i>)}
                          {site.desc ? <small>{site.desc}</small> : null}
                        </span>
                      </span>
                    </a>
                  </td>
                  <td><RankMovement period={data.period} site={site} /></td>
                  <td className="ranking-row-visits">
                    <strong>{formatNumber(site.currentVisits)}</strong>
                    <span>{formatVisitDelta(site.visitDelta)}</span>
                  </td>
                  <td className="ranking-heat-column">
                    <div className="ranking-table-heat">
                      <span>{strength}</span>
                      <i aria-hidden="true"><b style={{ width: `${strength}%` }} /></i>
                    </div>
                  </td>
                  <td>
                    <a
                      aria-label={`打开 ${site.name}（新窗口）`}
                      href={site.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={() => recordWebsiteVisit(site.id)}
                      className="ranking-row-arrow"
                    >
                      <span>查看</span>
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function RankingPodium({ data }: { data: RankingData }) {
  const podium = data.websites.slice(0, 3)
  const maxVisits = Math.max(1, podium[0]?.currentVisits ?? 0)

  return (
    <section aria-labelledby="ranking-podium-title" className="ranking-podium-section">
      <div className="ranking-section-heading">
        <div className="ranking-section-title">
          <span aria-hidden="true" className="ranking-section-ordinal">TOP 3</span>
          <div>
            <span>领先席位</span>
            <h2 id="ranking-podium-title">{RANKING_PAGE_CONTENT.podiumTitle}</h2>
            <p>实时榜首与最接近领先位置的站点</p>
          </div>
        </div>
        <div className="ranking-section-status">
          <p>
            {data.periodLabel}
            {' '}
            · 当前分类独立排名
          </p>
        </div>
      </div>
      <div className="ranking-podium-grid">
        {podium.map(site => (
          <PodiumCard key={site.id} maxVisits={maxVisits} period={data.period} site={site} />
        ))}
      </div>
    </section>
  )
}

export function RankingSkeleton() {
  return (
    <div className="skeleton--shimmer space-y-5">
      <Skeleton animationType="none" className="h-20 rounded-xl" />
      <div className="ranking-podium-skeleton">
        {[1, 2, 3].map(item => <Skeleton key={item} animationType="none" className="rounded-xl" />)}
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} animationType="none" className="h-16 rounded-none" />)}
      </div>
    </div>
  )
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}

function formatVisitDelta(value: number | null) {
  if (value === null)
    return '累计数据'
  if (value === 0)
    return '较上期持平'
  return `较上期 ${value > 0 ? '+' : ''}${formatNumber(value)}`
}

function PodiumCard({
  maxVisits,
  period,
  site,
}: {
  maxVisits: number
  period: RankingPeriod
  site: RankedWebsite
}) {
  const meta = PODIUM_META[site.rank - 1] ?? PODIUM_META[2]
  const strength = Math.max(4, getRankingStrength(maxVisits, site.currentVisits))

  return (
    <a
      aria-label={`第 ${site.rank} 名，${site.name}（新窗口）`}
      data-rank={site.rank}
      href={site.url}
      rel="noopener noreferrer"
      target="_blank"
      onClick={() => recordWebsiteVisit(site.id)}
      className={`ranking-podium-card ranking-podium-card--${site.rank}`}
    >
      <div className="ranking-podium-topline">
        <span className="ranking-podium-medal">
          {meta.label}
        </span>
        <span className="ranking-podium-competition">
          <i aria-hidden="true" />
          {meta.status}
        </span>
        <span aria-hidden="true" className="ranking-podium-number">
          {site.rank === 1 ? <CrownDiamond /> : null}
          <b>{formatRankingPosition(site.rank)}</b>
        </span>
      </div>

      <div className="ranking-podium-identity">
        <SiteLogo size={site.rank === 1 ? 'size-16' : 'size-14'} site={site} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3>{site.name}</h3>
            {site.badges.slice(0, 1).map(badge => <RankingBadge key={badge} badge={badge} />)}
          </div>
          <div className="ranking-podium-visits">
            <strong>{formatNumber(site.currentVisits)}</strong>
            <span>次有效访问</span>
          </div>
        </div>
      </div>

      <div className="ranking-podium-meta">
        <RankMovement period={period} site={site} />
        <span>{formatVisitDelta(site.visitDelta)}</span>
      </div>

      {site.desc ? <p className="ranking-podium-description">{site.desc}</p> : null}

      <div className="ranking-podium-categories">
        {site.categories.slice(0, 2).map(category => <span key={category.id}>{category.name}</span>)}
      </div>

      <div className="ranking-podium-score">
        <span>相对榜首</span>
        <strong>
          {strength}
          %
        </strong>
        <i aria-hidden="true"><b style={{ width: `${strength}%` }} /></i>
      </div>

      <span className="ranking-visit-action">
        查看网站
        <ArrowUpRight aria-hidden="true" />
      </span>
    </a>
  )
}

function RankingBadge({ badge }: { badge: RankingBadgeKind }) {
  const meta = BADGE_META[badge]
  const Icon = meta.icon
  return (
    <Chip color={meta.color} size="sm" variant="soft" className="ranking-data-badge">
      <Icon aria-hidden="true" />
      <Chip.Label>{meta.label}</Chip.Label>
    </Chip>
  )
}

function RankMovement({ period, site }: { period: RankingPeriod, site: RankedWebsite }) {
  const movement = getRankingMovement(period, site)

  if (movement.kind === 'up') {
    return (
      <span aria-label={movement.label} className="ranking-movement is-up">
        <ArrowUp aria-hidden="true" />
        {movement.amount}
      </span>
    )
  }

  if (movement.kind === 'down') {
    return (
      <span aria-label={movement.label} className="ranking-movement is-down">
        <ArrowDown aria-hidden="true" />
        {movement.amount}
      </span>
    )
  }

  return (
    <span className={`ranking-movement ${movement.kind === 'new' ? 'is-new' : 'is-static'}`}>
      {movement.label}
    </span>
  )
}

function SiteLogo({ site, size = 'size-12' }: { site: RankedWebsite, size?: string }) {
  if (!site.logo) {
    return (
      <span className={`${size} ranking-site-logo grid shrink-0 place-items-center text-lg font-black`}>
        {site.name.slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    <span className={`${size} ranking-site-logo relative shrink-0 overflow-hidden`}>
      <Image alt="" fill sizes="64px" src={generateLogoUrl(site.logo)} className="object-contain p-1.5" />
    </span>
  )
}

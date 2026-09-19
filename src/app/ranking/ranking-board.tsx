'use client'

import { CircleInfo } from '@gravity-ui/icons'
import { Button, Card } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { RANKING_PAGE_CONTENT } from '@/lib/rankings'

import {
  RankingList,
  RankingPodium,
  RankingSkeleton,
} from './ranking-content'
import RankingContentControls from './ranking-controls'

import type { RankingData, RankingPeriod } from '@/types'

export default function RankingBoard() {
  const [period, setPeriod] = useState<RankingPeriod>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const { data, loading, error, run } = useRequest<RankingData>('/rankings', {
    manual: true,
    progress: false,
  })

  useEffect(() => {
    run({ category: categoryId ?? undefined, period }).catch(() => {})
  }, [categoryId, period, run])

  const initialLoading = loading && !data
  const currentCategory = data?.categories.find(category => category.id === categoryId)
  const hasPresentedRankingsRef = useRef(false)
  const revealRankings = Boolean(data) && !hasPresentedRankingsRef.current

  useEffect(() => {
    if (data)
      hasPresentedRankingsRef.current = true
  }, [data])

  return (
    <div className="ranking-full-bleed">
      <div className="ranking-page mx-auto w-full pb-8">
        <section className="ranking-hero ranking-reveal">
          <div className="ranking-hero-main">
            <div className="ranking-hero-copy">
              <div className="ranking-hero-label">
                <span>{RANKING_PAGE_CONTENT.eyebrow}</span>
                <i aria-hidden="true" />
                实时榜单
              </div>
              <h1 aria-label={RANKING_PAGE_CONTENT.title}>
                <span>AI 网站</span>
                <mark className="ranking-hero-title-mark">热度</mark>
                <em>排行榜</em>
              </h1>
              <p>{RANKING_PAGE_CONTENT.description}</p>
              <div className="ranking-hero-caption">
                <CircleInfo aria-hidden="true" />
                <span>数据实时更新</span>
                <i />
                <span className="ranking-hero-caption-context">
                  {data?.periodLabel ?? '累计总榜'}
                  {' '}
                  ·
                  {' '}
                  {currentCategory?.name ?? '综合榜'}
                </span>
              </div>
            </div>

            <aside aria-label="实时热度概览" className="ranking-methodology">
              <div className="ranking-methodology-head">
                <strong>实时热度概览</strong>
                <span className="ranking-live-state">
                  <i />
                  {' '}
                  实时
                </span>
              </div>
              <div className="ranking-overview-metrics">
                <div>
                  <span>01</span>
                  <p>
                    <strong>{formatNumber(data?.summary.totalVisits)}</strong>
                    <small>有效访问</small>
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <p>
                    <strong>{data?.websites.length ?? '—'}</strong>
                    <small>上榜网站</small>
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <p>
                    <strong>{data?.summary.activeSites ?? '—'}</strong>
                    <small>活跃站点</small>
                  </p>
                </div>
              </div>
              <div className="ranking-methodology-foot">
                <CircleInfo aria-hidden="true" />
                <span>
                  {data?.methodology ?? '同一访客对同一网站 30 分钟内重复访问只计一次。'}
                  {' '}
                  · 更新于
                  {formatUpdatedAt(data?.generatedAt)}
                </span>
              </div>
            </aside>
          </div>

          <RankingContentControls
            categories={data?.categories ?? []}
            categoryId={categoryId}
            loading={loading}
            period={period}
            onCategoryChange={setCategoryId}
            onPeriodChange={setPeriod}
          />
        </section>

        {error && data
          ? (
              <div role="status" className="ranking-stale-notice">
                本次更新失败，当前继续展示上一次成功加载的数据。
                <button type="button" onClick={() => run({ category: categoryId ?? undefined, period })}>重新加载</button>
              </div>
            )
          : null}

        {initialLoading
          ? <RankingSkeleton />
          : error && !data
            ? (
                <Card className="items-center py-14 text-center">
                  <Card.Header>
                    <Card.Title>排行榜暂时开小差了</Card.Title>
                    <Card.Description>请稍后重试，现有网站数据不会受到影响。</Card.Description>
                  </Card.Header>
                  <Button size="sm" onPress={() => run({ category: categoryId ?? undefined, period })}>重新加载</Button>
                </Card>
              )
            : !data?.websites.length
                ? <EmptyContent />
                : (
                    <div
                      data-updating={loading}
                      className={`ranking-data-content${revealRankings ? ' ranking-reveal' : ''}`}
                    >
                      {data.period !== 'all' && data.summary.totalVisits === 0
                        ? (
                            <section className="ranking-quiet-period">
                              <span>暂无排行</span>
                              <h2>这个周期还没有产生有效访问</h2>
                              <p>当前不生成趋势名次和数据徽章，避免用累计数据伪装短期热度。</p>
                              <Button size="sm" variant="outline" onPress={() => setPeriod('all')}>查看累计总榜</Button>
                            </section>
                          )
                        : (
                            <>
                              <RankingPodium data={data} />
                              <RankingList data={data} />
                            </>
                          )}
                    </div>
                  )}
      </div>
    </div>
  )
}

function formatNumber(value?: number) {
  if (value === undefined)
    return '—'
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatUpdatedAt(value?: string) {
  if (!value)
    return '数据加载后显示'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

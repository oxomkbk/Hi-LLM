'use client'

import { useMemo, useRef, useState } from 'react'

import { selectAnalyticsWindow, summarizeAnalytics } from './admin-analytics-model'
import { analyticsAxisMaximum, analyticsLabelIndices, moveAnalyticsSelection } from './admin-chart-model'

import type { AdminAnalyticsMetricId, AdminAnalyticsPoint, AdminAnalyticsRange } from './admin-analytics-model'
import type { AdminDashboardAudience } from './dashboard-data'
import type { KeyboardEvent, PointerEvent } from 'react'

const METRICS: { id: AdminAnalyticsMetricId, label: string, shortLabel: string }[] = [
  { id: 'visits', label: '有效访问', shortLabel: '访问' },
  { id: 'users', label: '新增用户', shortLabel: '用户' },
  { id: 'contributions', label: '社区贡献', shortLabel: '贡献' },
]

const WIDTH = 920
const HEIGHT = 272
const BASELINE = 232
const TOP = 24

export default function AdminAnalyticsScreen({ audience }: { audience: AdminDashboardAudience }) {
  const [metric, setMetric] = useState<AdminAnalyticsMetricId>('visits')
  const [range, setRange] = useState<AdminAnalyticsRange>(30)
  const [selectedIndex, setSelectedIndex] = useState(range - 1)
  const chartRef = useRef<HTMLDivElement>(null)
  const series = audience.analytics[metric]
  const points = useMemo(
    () => series.available ? selectAnalyticsWindow(series.points, range) : [],
    [range, series],
  )
  const summary = useMemo(
    () => series.available ? summarizeAnalytics(series.points, range) : null,
    [range, series],
  )
  const plot = useMemo(() => createPlot(points), [points])
  const selected = plot.dots[Math.min(selectedIndex, Math.max(0, plot.dots.length - 1))]
  const metricLabel = METRICS.find(item => item.id === metric)?.label ?? ''

  const selectFromClientX = (clientX: number) => {
    const bounds = chartRef.current?.getBoundingClientRect()
    if (!bounds || !points.length)
      return
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width))
    setSelectedIndex(Math.round(ratio * (points.length - 1)))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary)
      return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    selectFromClientX(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType !== 'mouse' && !event.currentTarget.hasPointerCapture(event.pointerId)))
      return
    selectFromClientX(event.clientX)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length)
      return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      setSelectedIndex(current => moveAnalyticsSelection(current, points.length, event.key === 'ArrowRight' ? 1 : -1))
    }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setSelectedIndex(event.key === 'Home' ? 0 : points.length - 1)
    }
  }

  return (
    <section className={`admin-analytics-screen admin-analytics-screen--${metric}`}>
      <div className="admin-analytics-head">
        <div>
          <h2>访问与增长趋势</h2>
          <p>{points.at(-1) ? `数据截至 ${formatDate(points.at(-1)?.date)}` : '趋势数据暂不可用'}</p>
        </div>
        <div aria-label="统计范围" className="admin-analytics-range">
          {([7, 30] as const).map(option => (
            <button
              key={option}
              aria-pressed={range === option}
              type="button"
              onClick={() => {
                setRange(option)
                setSelectedIndex(option - 1)
              }}
            >
              {option}
              {' '}
              天
            </button>
          ))}
        </div>
      </div>

      <div aria-label="数据指标" className="admin-analytics-metrics">
        {METRICS.map((item) => {
          const itemSeries = audience.analytics[item.id]
          const itemSummary = itemSeries.available ? summarizeAnalytics(itemSeries.points, range) : null
          return (
            <button
              key={item.id}
              aria-pressed={metric === item.id}
              type="button"
              onClick={() => {
                setMetric(item.id)
                setSelectedIndex(range - 1)
              }}
            >
              <span>{item.shortLabel}</span>
              <strong>{itemSummary ? formatNumber(itemSummary.total) : '—'}</strong>
              <small>{item.label}</small>
            </button>
          )
        })}
      </div>

      {series.available && points.length
        ? (
            <div className="admin-analytics-plot-wrap">
              <div aria-live="polite" className="admin-analytics-readout">
                <span>{formatDate(selected?.point.date)}</span>
                <span>{metricLabel}</span>
                <strong>{formatNumber(selected?.point.value ?? 0)}</strong>
              </div>
              <div className="admin-analytics-chart-grid">
                <div aria-hidden="true" className="admin-analytics-y-axis">
                  {[3, 2, 1, 0].map(tick => <span key={tick}>{formatNumber(plot.max / 3 * tick)}</span>)}
                </div>
                <div
                  ref={chartRef}
                  aria-label={`${metricLabel}趋势图。当前选择 ${formatDate(selected?.point.date)}，${selected?.point.value ?? 0}。使用左右方向键查看每日数据。`}
                  role="group"
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  onPointerCancel={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId)
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  className="admin-analytics-plot"
                >
                  <svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
                    {[0, 1, 2, 3].map(index => (
                      <line
                        key={index}
                        x1="0"
                        x2={WIDTH}
                        y1={TOP + (BASELINE - TOP) / 3 * index}
                        y2={TOP + (BASELINE - TOP) / 3 * index}
                        className="admin-analytics-gridline"
                      />
                    ))}
                    <path d={plot.area} className="admin-analytics-area" />
                    <path d={plot.line} className="admin-analytics-line" />
                    {range === 7 ? plot.dots.map(dot => <circle key={dot.point.date} cx={dot.x} cy={dot.y} r="3.2" className="admin-analytics-dot" />) : null}
                    {selected
                      ? (
                          <g className="admin-analytics-selection">
                            <line x1={selected.x} x2={selected.x} y1={TOP} y2={BASELINE} />
                            <circle cx={selected.x} cy={selected.y} r="5" />
                          </g>
                        )
                      : null}
                  </svg>
                </div>
              </div>
              <div className="admin-analytics-axis">
                {axisLabels(points).map(point => <span key={point.date}>{formatShortDate(point.date)}</span>)}
              </div>
            </div>
          )
        : (
            <div role="status" className="admin-analytics-unavailable">
              <strong>该指标暂不可用</strong>
              <span>其他模块仍可正常使用，稍后刷新即可重试。</span>
            </div>
          )}

      <div className="admin-analytics-foot">
        <div>
          <span>日均</span>
          <strong>{summary ? formatNumber(summary.average) : '—'}</strong>
        </div>
        <div>
          <span>周期变化</span>
          <strong className={summary?.change && summary.change < 0 ? 'is-down' : undefined}>
            {formatChange(summary?.change)}
          </strong>
        </div>
        <div>
          <span>峰值</span>
          <strong>{summary?.peak ? formatNumber(summary.peak.value) : '—'}</strong>
          <small>{summary?.peak ? formatShortDate(summary.peak.date) : ''}</small>
        </div>
      </div>
    </section>
  )
}

function axisLabels(points: AdminAnalyticsPoint[]) {
  if (!points.length)
    return []
  const indices = analyticsLabelIndices(points.length)
  return indices.map(index => points[index])
}

function createPlot(points: AdminAnalyticsPoint[]) {
  const max = analyticsAxisMaximum(points.map(point => point.value))
  const dots = points.map((point, index) => ({
    point,
    x: points.length === 1 ? WIDTH / 2 : index * WIDTH / (points.length - 1),
    y: BASELINE - (BASELINE - TOP) * point.value / max,
  }))
  if (!dots.length)
    return { area: '', dots, line: '', max }

  let line = `M ${dots[0].x} ${dots[0].y}`
  for (let index = 1; index < dots.length; index += 1) {
    const previous = dots[index - 1]
    const current = dots[index]
    const middle = (previous.x + current.x) / 2
    line += ` C ${middle} ${previous.y}, ${middle} ${current.y}, ${current.x} ${current.y}`
  }
  return {
    area: `${line} L ${dots.at(-1)!.x} ${BASELINE} L ${dots[0].x} ${BASELINE} Z`,
    dots,
    line,
    max,
  }
}

function formatChange(change: number | null | undefined) {
  if (change === null || change === undefined)
    return '暂无基线'
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
}

function formatDate(value?: string) {
  if (!value)
    return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

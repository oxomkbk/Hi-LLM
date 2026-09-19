import { describe, expect, it } from 'vitest'

import { addDays, fillDailySeries, selectAnalyticsWindow, summarizeAnalytics } from './admin-analytics-model'

describe('admin analytics model', () => {
  it('fills a stable calendar series without treating missing days as missing data', () => {
    const points = fillDailySeries([
      { date: '2026-08-01', value: 3 },
      { date: '2026-08-03', value: 5 },
    ], '2026-08-01', 4)

    expect(points).toEqual([
      { date: '2026-08-01', value: 3 },
      { date: '2026-08-02', value: 0 },
      { date: '2026-08-03', value: 5 },
      { date: '2026-08-04', value: 0 },
    ])
  })

  it('selects the latest natural-day window', () => {
    const points = fillDailySeries([], '2026-07-01', 60)
    expect(selectAnalyticsWindow(points, 7)[0]?.date).toBe(addDays('2026-07-01', 53))
    expect(selectAnalyticsWindow(points, 30)).toHaveLength(30)
  })

  it('calculates totals, averages, latest peak and period change', () => {
    const points = [
      ...Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-0${index + 1}`, value: 1 })),
      ...Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${index + 10}`, value: index === 2 || index === 6 ? 4 : 2 })),
    ]
    const summary = summarizeAnalytics(points, 7)

    expect(summary.total).toBe(18)
    expect(summary.average).toBe(2.6)
    expect(summary.change).toBe(157.1)
    expect(summary.peak).toEqual({ date: '2026-08-16', value: 4 })
  })

  it('returns an unknown change when the previous period is zero', () => {
    const points = Array.from({ length: 14 }, (_, index) => ({
      date: addDays('2026-08-01', index),
      value: index >= 7 ? 2 : 0,
    }))
    expect(summarizeAnalytics(points, 7).change).toBeNull()
  })
})

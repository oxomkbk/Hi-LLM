export type AdminAnalyticsMetricId = 'contributions' | 'users' | 'visits'
export interface AdminAnalyticsPoint {
  date: string
  value: number
}

export type AdminAnalyticsRange = 7 | 30

export type AdminAnalyticsSeries
  = | { available: true, points: AdminAnalyticsPoint[] }
    | { available: false, points: [] }

export interface AdminAnalyticsSummary {
  average: number
  change: number | null
  peak: AdminAnalyticsPoint | null
  total: number
}

const DAY_MS = 86_400_000

export function addDays(date: string, amount: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + amount * DAY_MS).toISOString().slice(0, 10)
}

export function fillDailySeries(
  rows: AdminAnalyticsPoint[],
  startDate: string,
  count = 60,
): AdminAnalyticsPoint[] {
  const byDate = new Map(rows.map(point => [point.date.slice(0, 10), Math.max(0, finite(point.value))]))
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(startDate, index)
    return { date, value: byDate.get(date) ?? 0 }
  })
}

export function selectAnalyticsWindow(points: AdminAnalyticsPoint[], range: AdminAnalyticsRange) {
  return points.slice(-range)
}

export function summarizeAnalytics(
  points: AdminAnalyticsPoint[],
  range: AdminAnalyticsRange,
): AdminAnalyticsSummary {
  const current = points.slice(-range)
  const previous = points.slice(-(range * 2), -range)
  const total = sum(current)
  const previousTotal = sum(previous)
  const peak = current.reduce<AdminAnalyticsPoint | null>((selected, point) => {
    if (!selected || point.value >= selected.value)
      return point
    return selected
  }, null)

  return {
    average: current.length ? roundOne(total / current.length) : 0,
    change: previousTotal > 0 ? roundOne((total - previousTotal) / previousTotal * 100) : null,
    peak,
    total,
  }
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10
}

function sum(points: AdminAnalyticsPoint[]) {
  return points.reduce((total, point) => total + finite(point.value), 0)
}

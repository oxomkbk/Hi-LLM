/** Three equal count intervals, always ending at a readable integer. */
export function analyticsAxisMaximum(values: number[]) {
  const maximum = Math.max(0, ...values.filter(Number.isFinite))
  const rawStep = Math.max(1, maximum / 3)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].find(value => value * magnitude >= rawStep) ?? 10
  return step * magnitude * 3
}

export function analyticsLabelIndices(length: number) {
  return length > 0 ? [...new Set([0, Math.round((length - 1) / 2), length - 1])] : []
}

export function moveAnalyticsSelection(index: number, length: number, direction: -1 | 1) {
  const last = Math.max(0, length - 1)
  const displayed = Math.max(0, Math.min(index, last))
  return Math.max(0, Math.min(last, displayed + direction))
}

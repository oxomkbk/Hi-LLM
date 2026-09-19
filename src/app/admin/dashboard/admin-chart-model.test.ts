import { describe, expect, it } from 'vitest'

import { analyticsAxisMaximum, analyticsLabelIndices, moveAnalyticsSelection } from './admin-chart-model'

describe('admin chart scale and interaction', () => {
  it('uses an integer count scale even for zero or sparse activity', () => {
    expect(analyticsAxisMaximum([])).toBe(3)
    expect(analyticsAxisMaximum([0, 1])).toBe(3)
    expect(analyticsAxisMaximum([34])).toBe(60)
    expect(analyticsAxisMaximum([301])).toBe(600)
  })
  it('does not repeat date labels when only one or two points exist', () => {
    expect(analyticsLabelIndices(0)).toEqual([])
    expect(analyticsLabelIndices(1)).toEqual([0])
    expect(analyticsLabelIndices(2)).toEqual([0, 1])
  })
  it('moves left from the displayed last point after changing to a short series', () => {
    expect(moveAnalyticsSelection(29, 3, -1)).toBe(1)
    expect(moveAnalyticsSelection(0, 3, -1)).toBe(0)
    expect(moveAnalyticsSelection(2, 3, 1)).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'

import { getPaginationTokens, normalizePage } from './pagination'

describe('getPaginationTokens', () => {
  it('shows every page when the range is short', () => {
    expect(getPaginationTokens(2, 3)).toEqual([
      { key: 'page-1', type: 'page', value: 1 },
      { key: 'page-2', type: 'page', value: 2 },
      { key: 'page-3', type: 'page', value: 3 },
    ])
  })

  it('keeps first, current neighborhood and last pages', () => {
    expect(getPaginationTokens(6, 12)).toEqual([
      { key: 'page-1', type: 'page', value: 1 },
      { key: 'ellipsis-start', type: 'ellipsis' },
      { key: 'page-5', type: 'page', value: 5 },
      { key: 'page-6', type: 'page', value: 6 },
      { key: 'page-7', type: 'page', value: 7 },
      { key: 'ellipsis-end', type: 'ellipsis' },
      { key: 'page-12', type: 'page', value: 12 },
    ])
  })

  it('normalizes out-of-range input', () => {
    expect(getPaginationTokens(99, 2).map(token => token.value).filter(Boolean)).toEqual([1, 2])
  })
})

describe('normalizePage', () => {
  it('clamps page input to the available range', () => {
    expect(normalizePage(-2, 12)).toBe(1)
    expect(normalizePage(8.9, 12)).toBe(8)
    expect(normalizePage(99, 12)).toBe(12)
  })

  it('falls back safely for invalid values and totals', () => {
    expect(normalizePage(Number.NaN, 12)).toBe(1)
    expect(normalizePage(3, 0)).toBe(1)
  })
})

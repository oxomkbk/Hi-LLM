import { describe, expect, it } from 'vitest'

import { buildPageItems, pageRange } from './pagination-model'

describe('content pagination model', () => {
  it('keeps the first pages and final page visible at the beginning', () => {
    expect(buildPageItems(1, 62)).toEqual([1, 2, 3, 4, 5, 'end-ellipsis', 62])
  })

  it('keeps the current page and both boundaries visible in the middle', () => {
    expect(buildPageItems(31, 62)).toEqual([1, 'start-ellipsis', 30, 31, 32, 'end-ellipsis', 62])
  })

  it('keeps the final pages visible at the end', () => {
    expect(buildPageItems(62, 62)).toEqual([1, 'start-ellipsis', 58, 59, 60, 61, 62])
  })

  it('describes the visible item range', () => {
    expect(pageRange(3, 24, 1488)).toEqual({ end: 72, start: 49 })
    expect(pageRange(62, 24, 1488)).toEqual({ end: 1488, start: 1465 })
  })
})

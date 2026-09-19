import { describe, expect, it } from 'vitest'

import { parseSingleRange, RangeNotSatisfiableError } from './range'

describe('parseSingleRange', () => {
  it('parses explicit, open-ended, and suffix ranges', () => {
    expect(parseSingleRange('bytes=10-19', 100)).toEqual({ end: 19, start: 10 })
    expect(parseSingleRange('bytes=90-', 100)).toEqual({ end: 99, start: 90 })
    expect(parseSingleRange('bytes=-10', 100)).toEqual({ end: 99, start: 90 })
  })

  it('rejects multiple and out-of-bounds ranges', () => {
    expect(() => parseSingleRange('bytes=0-1,4-5', 100)).toThrow(RangeNotSatisfiableError)
    expect(() => parseSingleRange('bytes=100-', 100)).toThrow(RangeNotSatisfiableError)
  })
})

import { describe, expect, it } from 'vitest'

import { allowFileRead } from './read-rate-limit'

describe('public file read rate limit', () => {
  it('allows 500 reads per identity in one window and rejects the next read', () => {
    const identity = `catalog-page-${crypto.randomUUID()}`

    for (let request = 0; request < 500; request += 1)
      expect(allowFileRead(identity)).toBe(true)

    expect(allowFileRead(identity)).toBe(false)
  })
})

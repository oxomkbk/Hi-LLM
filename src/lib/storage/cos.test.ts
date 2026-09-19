import { describe, expect, it } from 'vitest'

import { normalizeCosPartNumber, normalizeCosPartSize } from './cos'
import { StorageProviderResponseError } from './types'

describe('normalizeCosPartSize', () => {
  it.each([
    [1, 1],
    ['1048576', 1048576],
  ])('normalizes COS part size %p', (input, expected) => {
    expect(normalizeCosPartSize(input)).toBe(expected)
  })

  it.each([undefined, null, '', 'NaN', '1.5', 0, -1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid COS part size %p',
    (input) => {
      expect(() => normalizeCosPartSize(input)).toThrow(StorageProviderResponseError)
      try {
        normalizeCosPartSize(input)
      }
      catch (error) {
        expect(error).toMatchObject({ code: 'STORAGE_PROVIDER_RESPONSE_INVALID', status: 502 })
      }
    },
  )
})

describe('normalizeCosPartNumber', () => {
  it.each([
    [1, 1],
    ['1', 1],
    ['10000', 10000],
  ])('normalizes COS part number %p', (input, expected) => {
    expect(normalizeCosPartNumber(input)).toBe(expected)
  })

  it.each([undefined, null, '', 'NaN', '1.5', 0, -1, 10001])(
    'rejects invalid COS part number %p',
    (input) => {
      expect(() => normalizeCosPartNumber(input)).toThrow(StorageProviderResponseError)
    },
  )
})

import { describe, expect, it, vi } from 'vitest'

import { StorageProviderResponseError } from '../storage/types'
import { listCompleteParts, UploadPartsValidationError, validateCompleteParts } from './parts'

const expectation = { partCount: 2, partSize: 5, totalSize: 8 }

describe('validateCompleteParts', () => {
  it('returns parts in canonical order', () => {
    expect(validateCompleteParts(expectation, [
      { etag: 'b', partNumber: 2, size: 3 },
      { etag: 'a', partNumber: 1, size: 5 },
    ])).toEqual([
      { etag: 'a', partNumber: 1, size: 5 },
      { etag: 'b', partNumber: 2, size: 3 },
    ])
  })

  it('marks a missing part as retryable', () => {
    expect(() => validateCompleteParts(expectation, [
      { etag: 'a', partNumber: 1, size: 5 },
    ])).toThrow(expect.objectContaining({
      code: 'UPLOAD_PARTS_INCOMPLETE',
      retryable: true,
    }))
  })

  it.each([
    [[{ etag: 'a', partNumber: 1, size: 5 }, { etag: 'b', partNumber: 1, size: 5 }], 'UPLOAD_PARTS_INVALID'],
    [[{ etag: 'a', partNumber: 1, size: 5 }, { etag: 'b', partNumber: 3, size: 3 }], 'UPLOAD_PARTS_INVALID'],
    [[{ etag: 'a', partNumber: 1, size: 4 }, { etag: 'b', partNumber: 2, size: 3 }], 'UPLOAD_PART_LENGTH_MISMATCH'],
  ])('rejects structurally invalid parts %#', (parts, code) => {
    expect(() => validateCompleteParts(expectation, parts)).toThrow(expect.objectContaining({
      code,
      retryable: false,
    }))
  })

  it('rejects a non-integer size as an invalid provider response', () => {
    expect(() => validateCompleteParts(expectation, [
      { etag: 'a', partNumber: 1, size: Number.NaN },
      { etag: 'b', partNumber: 2, size: 3 },
    ])).toThrow(StorageProviderResponseError)
  })
})

describe('listCompleteParts', () => {
  it('retries only incomplete listings with the bounded schedule', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([{ etag: 'a', partNumber: 1, size: 5 }])
      .mockResolvedValueOnce([{ etag: 'a', partNumber: 1, size: 5 }])
      .mockResolvedValueOnce([
        { etag: 'a', partNumber: 1, size: 5 },
        { etag: 'b', partNumber: 2, size: 3 },
      ])
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(listCompleteParts({ expectation, list, sleep })).resolves.toHaveLength(2)
    expect(list).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[150], [350]])
  })

  it('does not retry a structural error', async () => {
    const list = vi.fn().mockResolvedValue([
      { etag: 'a', partNumber: 1, size: 4 },
      { etag: 'b', partNumber: 2, size: 3 },
    ])

    await expect(listCompleteParts({ expectation, list })).rejects.toBeInstanceOf(UploadPartsValidationError)
    expect(list).toHaveBeenCalledOnce()
  })
})

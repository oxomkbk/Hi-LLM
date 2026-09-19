import { describe, expect, it } from 'vitest'

import { catalogIconSource, normalizeCatalogFileReference } from './catalog-icons'

const fileId = '8e429aa4-54c9-4f49-b813-1b23f6993091'

describe('catalog icon references', () => {
  it('normalizes uploaded file URLs to stable tokens', () => {
    expect(normalizeCatalogFileReference(`/api/files/${fileId}`)).toBe(`file:${fileId}`)
    expect(normalizeCatalogFileReference(`file:${fileId}`)).toBe(`file:${fileId}`)
  })

  it('resolves internal tokens and public HTTPS URLs', () => {
    expect(catalogIconSource(`file:${fileId}`)).toBe(`/api/files/${fileId}`)
    expect(catalogIconSource('https://example.com/icon.png')).toBe('https://example.com/icon.png')
  })

  it('rejects unsafe or malformed sources', () => {
    expect(catalogIconSource('http://example.com/icon.png')).toBeNull()
    expect(catalogIconSource('file:not-a-uuid')).toBeNull()
    expect(catalogIconSource('javascript:alert(1)')).toBeNull()
  })
})

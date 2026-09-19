import { describe, expect, it } from 'vitest'

import { extractionIconToFile } from './website-extraction-client'

describe('extracted website icon', () => {
  it('converts the preview data into a real upload file', async () => {
    const file = extractionIconToFile({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      filename: 'website-icon.png',
      mimeType: 'image/png',
      size: 8,
    })

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('website-icon.png')
    expect(file.type).toBe('image/png')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
  })
})

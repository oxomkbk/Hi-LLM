import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { detectImageMimeType } from './image-signature'

describe('detectImageMimeType', () => {
  it.each([
    [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'image/png'],
    [Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg'],
    [Buffer.from('RIFF1234WEBP', 'ascii'), 'image/webp'],
  ] as const)('识别真实图片文件头', (header, expected) => {
    expect(detectImageMimeType(header)).toBe(expected)
  })

  it('拒绝伪装成图片的文本', () => {
    expect(detectImageMimeType(Buffer.from('<script>alert(1)</script>'))).toBeNull()
  })
})

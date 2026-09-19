import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { normalizeProfileBackgroundObject } from './image'

import type { StorageProvider } from '../storage/types'

vi.mock('server-only', () => ({}))

describe('profile background image normalization', () => {
  it('accepts a valid low-quality JPEG when safe normalization increases its byte size', async () => {
    const source = await createLowQualityJpeg()
    let stored: Buffer | undefined
    const provider: StorageProvider = {
      abortMultipartUpload: unsupported,
      completeMultipartUpload: unsupported,
      createMultipartUpload: unsupported,
      createReadStream: async () => Readable.from(source),
      createReadUrl: unsupported,
      deleteObject: unsupported,
      headObject: unsupported,
      healthCheck: unsupported,
      listParts: unsupported,
      putObject: async (input) => {
        stored = await readStream(input.body)
        return {
          contentType: input.contentType,
          size: stored.length,
        }
      },
      uploadPart: unsupported,
    }

    const normalized = await normalizeProfileBackgroundObject({
      declaredMimeType: 'image/jpeg',
      objectKey: 'profile-backgrounds/example.jpg',
      provider,
      sourceSize: source.length,
    })

    expect(stored).toBeDefined()
    expect(stored!.length).toBeGreaterThan(source.length)
    expect(stored!.length).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(normalized).toMatchObject({
      height: 540,
      mimeType: 'image/jpeg',
      objectKey: 'profile-backgrounds/example.normalized.jpg',
      width: 960,
    })
    expect(await sharp(stored!).metadata()).toMatchObject({
      format: 'jpeg',
      height: 540,
      width: 960,
    })
  })
})

async function createLowQualityJpeg() {
  const height = 540
  const width = 960
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3
      pixels[offset] = (x * 37 + y * 17 + (x * y) % 251) % 256
      pixels[offset + 1] = (x * 11 + y * 43 + ((x >> 3) ^ (y >> 2)) * 29) % 256
      pixels[offset + 2] = (x * 23 + y * 7 + ((x + y) % 31) * 8) % 256
    }
  }
  return sharp(pixels, { raw: { channels: 3, height, width } })
    .jpeg({ chromaSubsampling: '4:2:0', quality: 1 })
    .toBuffer()
}

async function readStream(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function unsupported(): Promise<never> {
  throw new Error('Unexpected storage operation')
}

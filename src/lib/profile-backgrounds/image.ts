import 'server-only'

import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import sharp from 'sharp'

import { detectImageMimeType } from '../uploads/image-signature'

import type { StorageProvider } from '../storage/types'

const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024
const MAX_INPUT_PIXELS = 40_000_000
const MAX_EDGE = 4096

export class ProfileBackgroundImageError extends Error {
  constructor(message: string, readonly status = 415, readonly code = 'PROFILE_BACKGROUND_IMAGE_INVALID') {
    super(message)
  }
}

export async function normalizeProfileBackgroundObject(input: {
  declaredMimeType: string
  objectKey: string
  provider: StorageProvider
  sourceSize: number
}) {
  const source = await readObject(input.provider, input.objectKey, input.sourceSize)
  const detectedMimeType = detectImageMimeType(source.subarray(0, 16))
  if (!detectedMimeType || detectedMimeType !== input.declaredMimeType)
    throw new ProfileBackgroundImageError('背景图片真实格式与声明类型不一致')

  let data: Buffer
  let height: number
  let width: number
  try {
    let transformer = sharp(source, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        fit: 'inside',
        height: MAX_EDGE,
        width: MAX_EDGE,
        withoutEnlargement: true,
      })

    if (detectedMimeType === 'image/jpeg')
      transformer = transformer.jpeg({ mozjpeg: true, quality: 88 })
    else if (detectedMimeType === 'image/png')
      transformer = transformer.png({ adaptiveFiltering: true, compressionLevel: 9, palette: true, quality: 90 })
    else
      transformer = transformer.webp({ effort: 5, quality: 88 })

    const normalized = await transformer.toBuffer({ resolveWithObject: true })
    data = normalized.data
    height = normalized.info.height
    width = normalized.info.width
  }
  catch (error) {
    if (error instanceof ProfileBackgroundImageError)
      throw error
    throw new ProfileBackgroundImageError('背景图片无法安全解析，请更换图片')
  }

  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE)
    throw new ProfileBackgroundImageError('背景图片尺寸无效')
  if (data.length <= 0 || data.length > MAX_BACKGROUND_BYTES)
    throw new ProfileBackgroundImageError('背景图片安全处理后体积异常，请压缩后重试', 413, 'PROFILE_BACKGROUND_IMAGE_TOO_LARGE')

  const objectKey = normalizedObjectKey(input.objectKey)
  const metadata = await input.provider.putObject({
    body: Readable.from(data),
    contentLength: data.length,
    contentType: detectedMimeType,
    key: objectKey,
  })
  return {
    height,
    metadata,
    mimeType: detectedMimeType,
    objectKey,
    width,
  }
}

function normalizedObjectKey(objectKey: string) {
  const extensionIndex = objectKey.lastIndexOf('.')
  if (extensionIndex <= 0)
    throw new ProfileBackgroundImageError('背景图片对象键无效')
  return `${objectKey.slice(0, extensionIndex)}.normalized${objectKey.slice(extensionIndex)}`
}

async function readObject(provider: StorageProvider, objectKey: string, expectedSize: number) {
  const stream = await provider.createReadStream({ key: objectKey })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BACKGROUND_BYTES || size > expectedSize)
      throw new ProfileBackgroundImageError('背景图片内容长度异常', 413, 'PROFILE_BACKGROUND_IMAGE_TOO_LARGE')
    chunks.push(buffer)
  }
  if (size !== expectedSize)
    throw new ProfileBackgroundImageError('背景图片内容长度异常', 409, 'UPLOAD_SIZE_MISMATCH')
  return Buffer.concat(chunks, size)
}

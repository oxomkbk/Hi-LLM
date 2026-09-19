import COS from 'cos-nodejs-sdk-v5'

import { assertObjectKey, assertPartNumber } from './key'
import { ExactLengthTransform } from './stream'
import { StorageNotFoundError, StorageProviderResponseError } from './types'

import type { StorageProvider } from './types'
import type { CosStorageProfileConfig } from '@/lib/runtime/types'
import type { Readable } from 'node:stream'

export class CosStorageProvider implements StorageProvider {
  private readonly bucket: string
  private readonly client: COS

  constructor(private readonly config: CosStorageProfileConfig) {
    this.bucket = config.bucket.endsWith(`-${config.appId}`)
      ? config.bucket
      : `${config.bucket}-${config.appId}`
    this.client = new COS({
      ChunkRetryTimes: 2,
      KeepAlive: true,
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      StrictSsl: true,
      Timeout: 30_000,
    })
  }

  async healthCheck() {
    await this.client.getBucket({
      Bucket: this.bucket,
      MaxKeys: 1,
      Prefix: '__hillm_nav_healthcheck__',
      Region: this.config.region,
    })
  }

  async putObject(input: Parameters<StorageProvider['putObject']>[0]) {
    const limiter = new ExactLengthTransform(input.contentLength)
    const result = await this.client.putObject({
      ACL: 'private',
      Body: input.body.pipe(limiter),
      Bucket: this.bucket,
      ContentLength: input.contentLength,
      ContentType: input.contentType,
      Key: assertObjectKey(input.key),
      Region: this.config.region,
    })
    return {
      contentType: input.contentType,
      etag: result.ETag,
      sha256: limiter.digest(),
      size: limiter.bytesRead,
    }
  }

  async createMultipartUpload(input: Parameters<StorageProvider['createMultipartUpload']>[0]) {
    const result = await this.client.multipartInit({
      ACL: 'private',
      Bucket: this.bucket,
      ContentType: input.contentType,
      Key: assertObjectKey(input.key),
      Region: this.config.region,
    })
    return { uploadId: result.UploadId }
  }

  async uploadPart(input: Parameters<StorageProvider['uploadPart']>[0]) {
    const limiter = new ExactLengthTransform(input.contentLength)
    const result = await this.client.multipartUpload({
      Body: input.body.pipe(limiter),
      Bucket: this.bucket,
      ContentLength: input.contentLength,
      Key: assertObjectKey(input.key),
      PartNumber: assertPartNumber(input.partNumber),
      Region: this.config.region,
      UploadId: assertCosUploadId(input.uploadId),
    })
    return { etag: result.ETag, partNumber: input.partNumber, size: limiter.bytesRead }
  }

  async listParts(input: Parameters<StorageProvider['listParts']>[0]) {
    const result = await this.client.multipartListPart({
      Bucket: this.bucket,
      Key: assertObjectKey(input.key),
      MaxParts: 1_000,
      Region: this.config.region,
      UploadId: assertCosUploadId(input.uploadId),
    })
    return result.Part.map(part => ({
      etag: part.ETag,
      partNumber: normalizeCosPartNumber(part.PartNumber),
      size: normalizeCosPartSize(part.Size),
    })).sort((a, b) => a.partNumber - b.partNumber)
  }

  async completeMultipartUpload(input: Parameters<StorageProvider['completeMultipartUpload']>[0]) {
    const result = await this.client.multipartComplete({
      Bucket: this.bucket,
      Key: assertObjectKey(input.key),
      Parts: input.parts.map(part => ({ ETag: part.etag, PartNumber: part.partNumber })),
      Region: this.config.region,
      UploadId: assertCosUploadId(input.uploadId),
    })
    const head = await this.headObject(input.key)
    return { ...head, etag: result.ETag }
  }

  async abortMultipartUpload(input: Parameters<StorageProvider['abortMultipartUpload']>[0]) {
    await this.client.multipartAbort({
      Bucket: this.bucket,
      Key: assertObjectKey(input.key),
      Region: this.config.region,
      UploadId: assertCosUploadId(input.uploadId),
    })
  }

  async headObject(key: string) {
    try {
      const result = await this.client.headObject({
        Bucket: this.bucket,
        Key: assertObjectKey(key),
        Region: this.config.region,
      })
      const headers = result.headers as Record<string, string | undefined>
      const size = Number(headers['content-length'])
      return {
        contentType: headers['content-type'],
        etag: result.ETag,
        lastModified: headers['last-modified'] ? new Date(headers['last-modified']) : undefined,
        size,
      }
    }
    catch (error) {
      if (isCosNotFound(error))
        throw new StorageNotFoundError('文件不存在')
      throw error
    }
  }

  async createReadStream(input: Parameters<StorageProvider['createReadStream']>[0]) {
    const range = input.start === undefined
      ? undefined
      : `bytes=${input.start}-${input.end ?? ''}`
    return this.client.getObjectStream({
      Bucket: this.bucket,
      Key: assertObjectKey(input.key),
      Range: range,
      Region: this.config.region,
    }) as Readable
  }

  async createReadUrl(input: Parameters<StorageProvider['createReadUrl']>[0]) {
    const result = this.client.getObjectUrl({
      Bucket: this.bucket,
      Expires: Math.min(900, Math.max(30, input.expiresInSeconds)),
      Key: assertObjectKey(input.key),
      Method: 'GET',
      Region: this.config.region,
      Sign: true,
    })
    return result.startsWith('//') ? `https:${result}` : result
  }

  async deleteObject(key: string) {
    await this.client.deleteObject({
      Bucket: this.bucket,
      Key: assertObjectKey(key),
      Region: this.config.region,
    })
  }
}

export function normalizeCosPartNumber(value: unknown) {
  const partNumber = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(partNumber) || partNumber <= 0 || partNumber > 10_000)
    throw new StorageProviderResponseError('COS 返回了无效的分片编号')
  return partNumber
}

export function normalizeCosPartSize(value: unknown) {
  const size = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new StorageProviderResponseError('COS 返回了无效的分片长度')
  return size
}

function assertCosUploadId(uploadId: string) {
  const hasControlCharacters = Array.from(uploadId).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 32 || code === 127
  })
  if (!uploadId || uploadId.length > 2_048 || hasControlCharacters)
    throw new Error('COS 上传任务编号无效')
  return uploadId
}

function isCosNotFound(error: unknown) {
  if (!error || typeof error !== 'object')
    return false
  const value = error as { code?: string, statusCode?: number }
  return value.statusCode === 404 || value.code === 'NoSuchKey'
}

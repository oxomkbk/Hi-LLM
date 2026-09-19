import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { assertObjectKey, assertPartNumber, assertUploadId } from './key'
import { ExactLengthTransform } from './stream'
import { StorageNotFoundError } from './types'

import type { StorageProvider } from './types'
import type { Readable } from 'node:stream'

export class LocalStorageProvider implements StorageProvider {
  private readonly multipartRoot: string
  private readonly objectsRoot: string

  constructor(private readonly root: string) {
    this.objectsRoot = path.join(root, 'objects')
    this.multipartRoot = path.join(root, '.multipart')
  }

  async healthCheck() {
    await Promise.all([
      mkdir(this.objectsRoot, { recursive: true }),
      mkdir(this.multipartRoot, { recursive: true }),
    ])
  }

  async putObject(input: Parameters<StorageProvider['putObject']>[0]) {
    const destination = this.objectPath(input.key)
    const result = await writeExactFile(destination, input.body, input.contentLength)
    return { contentType: input.contentType, sha256: result.sha256, size: result.size }
  }

  async createMultipartUpload(input: Parameters<StorageProvider['createMultipartUpload']>[0]) {
    assertObjectKey(input.key)
    const uploadId = randomUUID()
    await mkdir(this.multipartRoot, { recursive: true })
    await mkdir(this.uploadDirectory(uploadId), { recursive: false, mode: 0o700 })
    return { uploadId }
  }

  async uploadPart(input: Parameters<StorageProvider['uploadPart']>[0]) {
    assertObjectKey(input.key)
    const partNumber = assertPartNumber(input.partNumber)
    const destination = path.join(this.uploadDirectory(input.uploadId), `${partNumber}.part`)
    const result = await writeExactFile(destination, input.body, input.contentLength)
    return { etag: result.sha256, partNumber, size: result.size }
  }

  async listParts(input: Parameters<StorageProvider['listParts']>[0]) {
    assertObjectKey(input.key)
    const directory = this.uploadDirectory(input.uploadId)
    let entries: string[]
    try {
      entries = await readdir(directory)
    }
    catch (error) {
      if (isNotFound(error))
        throw new StorageNotFoundError('分片上传任务不存在')
      throw error
    }

    const parts = await Promise.all(entries
      .filter(entry => /^\d+\.part$/.test(entry))
      .map(async (entry) => {
        const partNumber = Number.parseInt(entry, 10)
        const file = path.join(directory, entry)
        const [metadata, etag] = await Promise.all([stat(file), hashFile(file)])
        return { etag, partNumber, size: metadata.size }
      }))
    return parts.sort((a, b) => a.partNumber - b.partNumber)
  }

  async completeMultipartUpload(input: Parameters<StorageProvider['completeMultipartUpload']>[0]) {
    const destination = this.objectPath(input.key)
    const uploadDirectory = this.uploadDirectory(input.uploadId)
    const ordered = [...input.parts].sort((a, b) => a.partNumber - b.partNumber)
    if (!ordered.length)
      throw new Error('没有可合并的上传分片')

    await mkdir(path.dirname(destination), { recursive: true })
    const temporary = `${destination}.${randomUUID()}.tmp`
    const writer = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
    const hash = createHash('sha256')
    let total = 0

    try {
      for (const expected of ordered) {
        const file = path.join(uploadDirectory, `${assertPartNumber(expected.partNumber)}.part`)
        const metadata = await stat(file)
        if (metadata.size !== expected.size)
          throw new Error(`分片 ${expected.partNumber} 长度校验失败`)
        for await (const chunk of createReadStream(file)) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          total += buffer.length
          hash.update(buffer)
          if (!writer.write(buffer)) {
            await new Promise<void>((resolve, reject) => {
              writer.once('drain', resolve)
              writer.once('error', reject)
            })
          }
        }
      }
      const closed = new Promise<void>((resolve, reject) => {
        writer.once('close', resolve)
        writer.once('error', reject)
      })
      writer.end()
      await closed
      await syncFile(temporary)
      await rename(temporary, destination)
      await rm(uploadDirectory, { force: true, recursive: true })
    }
    catch (error) {
      writer.destroy()
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }

    return { sha256: hash.digest('hex'), size: total }
  }

  async abortMultipartUpload(input: Parameters<StorageProvider['abortMultipartUpload']>[0]) {
    assertObjectKey(input.key)
    await rm(this.uploadDirectory(input.uploadId), { force: true, recursive: true })
  }

  async headObject(key: string) {
    try {
      const metadata = await stat(this.objectPath(key))
      return { lastModified: metadata.mtime, size: metadata.size }
    }
    catch (error) {
      if (isNotFound(error))
        throw new StorageNotFoundError('文件不存在')
      throw error
    }
  }

  async createReadStream(input: Parameters<StorageProvider['createReadStream']>[0]) {
    await this.headObject(input.key)
    return createReadStream(this.objectPath(input.key), {
      end: input.end,
      start: input.start,
    })
  }

  async createReadUrl() {
    return null
  }

  async deleteObject(key: string) {
    await rm(this.objectPath(key), { force: true })
  }

  private objectPath(key: string) {
    const resolved = path.resolve(this.objectsRoot, assertObjectKey(key))
    if (!resolved.startsWith(`${path.resolve(this.objectsRoot)}${path.sep}`))
      throw new Error('对象路径越界')
    return resolved
  }

  private uploadDirectory(uploadId: string) {
    return path.join(this.multipartRoot, assertUploadId(uploadId))
  }
}

async function hashFile(file: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file))
    hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function syncFile(file: string) {
  const handle = await open(file, 'r')
  try {
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

async function writeExactFile(destination: string, body: Readable, contentLength: number) {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.tmp`
  const limiter = new ExactLengthTransform(contentLength)
  try {
    await pipeline(body, limiter, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
    await syncFile(temporary)
    await rename(temporary, destination)
    return { sha256: limiter.digest(), size: limiter.bytesRead }
  }
  catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

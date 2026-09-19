import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalStorageProvider } from './local'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('localStorageProvider', () => {
  it('writes an exact object atomically and supports byte ranges', async () => {
    const { provider, root } = await createProvider()
    const body = Buffer.from('0123456789')
    const stored = await provider.putObject({
      body: Readable.from(body),
      contentLength: body.length,
      contentType: 'text/plain',
      key: 'files/test.txt',
    })

    expect(stored.size).toBe(10)
    expect(await readFile(path.join(root, 'objects/files/test.txt'), 'utf8')).toBe('0123456789')
    const range = await provider.createReadStream({ end: 6, key: 'files/test.txt', start: 3 })
    expect(await streamText(range)).toBe('3456')
  })

  it('rejects a body whose actual length differs from Content-Length', async () => {
    const { provider } = await createProvider()
    await expect(provider.putObject({
      body: Readable.from(Buffer.from('short')),
      contentLength: 20,
      contentType: 'text/plain',
      key: 'files/short.txt',
    })).rejects.toThrow('上传内容长度不匹配')
    await expect(provider.headObject('files/short.txt')).rejects.toThrow('文件不存在')
  })

  it('resumes multipart uploads and assembles ordered parts', async () => {
    const { provider } = await createProvider()
    const { uploadId } = await provider.createMultipartUpload({ contentType: 'text/plain', key: 'large/result.txt' })
    const first = await provider.uploadPart({
      body: Readable.from(Buffer.from('hello ')),
      contentLength: 6,
      key: 'large/result.txt',
      partNumber: 1,
      uploadId,
    })
    const second = await provider.uploadPart({
      body: Readable.from(Buffer.from('world')),
      contentLength: 5,
      key: 'large/result.txt',
      partNumber: 2,
      uploadId,
    })

    expect((await provider.listParts({ key: 'large/result.txt', uploadId })).map(part => part.partNumber)).toEqual([1, 2])
    const result = await provider.completeMultipartUpload({
      key: 'large/result.txt',
      parts: [second, first],
      uploadId,
    })
    expect(result.size).toBe(11)
    expect(await streamText(await provider.createReadStream({ key: 'large/result.txt' }))).toBe('hello world')
  })

  it('rejects traversal object keys', async () => {
    const { provider } = await createProvider()
    await expect(provider.putObject({
      body: Readable.from(Buffer.from('x')),
      contentLength: 1,
      contentType: 'text/plain',
      key: '../outside.txt',
    })).rejects.toThrow('对象键格式无效')
  })
})

async function createProvider() {
  const root = await mkdtemp(path.join(tmpdir(), 'hillm-nav-storage-'))
  roots.push(root)
  const provider = new LocalStorageProvider(root)
  await provider.healthCheck()
  return { provider, root }
}

async function streamText(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'

import type { Buffer } from 'node:buffer'

export class ExactLengthTransform extends Transform {
  private readonly hash = createHash('sha256')
  private received = 0

  constructor(private readonly expected: number) {
    super()
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new Error('无效的内容长度')
  }

  get bytesRead() {
    return this.received
  }

  digest() {
    return this.hash.digest('hex')
  }

  override _flush(callback: (error?: Error | null) => void) {
    if (this.received !== this.expected) {
      callback(new Error(`上传内容长度不匹配：期望 ${this.expected} 字节，实际 ${this.received} 字节`))
      return
    }
    callback()
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.received += chunk.length
    if (this.received > this.expected) {
      callback(new Error('上传内容超过声明长度'))
      return
    }
    this.hash.update(chunk)
    callback(null, chunk)
  }
}

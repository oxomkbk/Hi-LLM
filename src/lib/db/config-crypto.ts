import 'server-only'

import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { requireServerEnv } from './env'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 1

export interface EncryptedConfig {
  ciphertext: string
  iv: string
  tag: string
  version: number
}

export function decryptConfig<T>(encrypted: EncryptedConfig): T {
  if (encrypted.version !== VERSION)
    throw new Error('不支持的配置密文版本')

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(encrypted.iv, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as T
}

export function encryptConfig<T>(value: T): EncryptedConfig {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    version: VERSION,
  }
}

function encryptionKey() {
  const input = requireServerEnv('CONFIG_ENCRYPTION_KEY')
  const decoded = /^[a-f\d]{64}$/i.test(input)
    ? Buffer.from(input, 'hex')
    : Buffer.from(input, 'base64')

  if (decoded.length !== 32)
    throw new Error('CONFIG_ENCRYPTION_KEY 必须是 32 字节的 Base64 或 64 位十六进制值')

  return decoded
}

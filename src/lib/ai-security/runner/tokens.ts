import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ScannerJobTokenClaims extends ScannerJobTokenInput {
  aud: 'hillm-nav-ai-security-scanner'
  exp: number
}

export interface ScannerJobTokenInput {
  jobId: string
  model: string
  subjectType: 'skill'
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE64URL_PATTERN = /^[\w-]+$/

export function createScannerJobToken(input: ScannerJobTokenInput, secret: string, now = new Date()) {
  if (!UUID_PATTERN.test(input.jobId))
    throw new TypeError('Invalid scanner job ID')
  const model = input.model.normalize('NFC').trim()
  if (!model || model.length > 200 || /\s/.test(model))
    throw new TypeError('Invalid scanner model')
  const key = Buffer.from(secret, 'utf8')
  if (key.byteLength < 32 || key.byteLength > 4096)
    throw new TypeError('Scanner shared secret must contain 32 to 4096 UTF-8 bytes')
  const payload = Buffer.from(JSON.stringify({
    aud: 'hillm-nav-ai-security-scanner',
    exp: Math.floor(now.getTime() / 1000) + 300,
    jobId: input.jobId.toLowerCase(),
    model,
    subjectType: input.subjectType,
  }), 'utf8').toString('base64url')
  const signature = createHmac('sha256', key).update(payload, 'ascii').digest('base64url')
  return `${payload}.${signature}`
}

export function verifyScannerJobToken(token: string, secret: string, now = new Date()): ScannerJobTokenClaims {
  if (!token || token.length > 8192)
    throw new TypeError('Invalid scanner job token')
  const [payloadPart, signaturePart, extra] = token.split('.')
  if (!payloadPart || !signaturePart || extra !== undefined || !BASE64URL_PATTERN.test(payloadPart) || !BASE64URL_PATTERN.test(signaturePart))
    throw new TypeError('Invalid scanner job token')

  const key = Buffer.from(secret, 'utf8')
  if (key.byteLength < 32 || key.byteLength > 4096)
    throw new TypeError('Scanner shared secret must contain 32 to 4096 UTF-8 bytes')
  const expected = createHmac('sha256', key).update(payloadPart, 'ascii').digest()
  const signature = decodeBase64Url(signaturePart)
  if (signature.byteLength !== expected.byteLength || !timingSafeEqual(signature, expected))
    throw new TypeError('Invalid scanner job token')

  let value: unknown
  try {
    value = JSON.parse(decodeBase64Url(payloadPart).toString('utf8'))
  }
  catch {
    throw new TypeError('Invalid scanner job token')
  }
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'aud,exp,jobId,model,subjectType')
    throw new TypeError('Invalid scanner job token')
  if (value.aud !== 'hillm-nav-ai-security-scanner' || value.subjectType !== 'skill')
    throw new TypeError('Invalid scanner job token')
  if (typeof value.jobId !== 'string' || !UUID_PATTERN.test(value.jobId))
    throw new TypeError('Invalid scanner job token')
  if (typeof value.model !== 'string' || !value.model || value.model.length > 200 || /\s/.test(value.model))
    throw new TypeError('Invalid scanner job token')
  const currentSeconds = Math.floor(now.getTime() / 1000)
  if (!Number.isSafeInteger(value.exp) || Number(value.exp) < currentSeconds || Number(value.exp) > currentSeconds + 900)
    throw new TypeError('Invalid scanner job token')
  return value as unknown as ScannerJobTokenClaims
}

function decodeBase64Url(value: string) {
  if (!value || !BASE64URL_PATTERN.test(value))
    throw new TypeError('Invalid scanner job token')
  return Buffer.from(value, 'base64url')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

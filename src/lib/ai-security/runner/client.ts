import 'server-only'

import { createScannerJobToken } from './tokens'

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

export class SecurityScannerClientError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export async function checkSecurityScannerReadiness(expectedModel: string, signal?: AbortSignal) {
  const runtime = scannerRuntime()
  let response: Response
  try {
    response = await fetch(new URL('/health/ready', runtime.baseUrl), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal,
    })
  }
  catch (error) {
    throw new SecurityScannerClientError('安全扫描服务不可用', 503, 'SCANNER_SERVICE_UNAVAILABLE', { cause: error })
  }
  const body = await readBoundedBody(response, 4096)
  if (!response.ok)
    throw new SecurityScannerClientError('安全扫描服务尚未就绪', 503, scannerErrorCode(body))
  try {
    const result = JSON.parse(body)
    if (result?.status !== 'ready' || result?.scanner !== 'aig-skill-scan' || result?.version !== '0.2.1'
      || result?.model !== expectedModel) {
      throw new TypeError('Scanner identity mismatch')
    }
  }
  catch (error) {
    throw new SecurityScannerClientError('安全扫描服务版本不匹配', 503, 'SCANNER_VERSION_CHANGED', { cause: error })
  }
  return { scanner: 'aig-skill-scan' as const, version: '0.2.1' as const }
}

export async function scanSkillArchive(input: {
  archive: Uint8Array
  assessmentId: string
  model: string
  signal?: AbortSignal
}) {
  if (input.archive.byteLength < 1 || input.archive.byteLength > MAX_ARCHIVE_BYTES)
    throw new SecurityScannerClientError('扫描归档超出允许大小', 413, 'SOURCE_LIMIT_EXCEEDED')
  const runtime = scannerRuntime()
  const token = createScannerJobToken({
    jobId: input.assessmentId,
    model: input.model,
    subjectType: 'skill',
  }, runtime.sharedSecret)
  let response: Response
  try {
    response = await fetch(new URL('/v1/scan/skill', runtime.baseUrl), {
      body: Uint8Array.from(input.archive),
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Length': String(input.archive.byteLength),
        'Content-Type': 'application/zip',
      },
      method: 'POST',
      redirect: 'error',
      signal: input.signal,
    })
  }
  catch (error) {
    throw new SecurityScannerClientError('安全扫描服务不可用', 503, 'SCANNER_SERVICE_UNAVAILABLE', { cause: error })
  }
  const body = await readBoundedBody(response, MAX_RESPONSE_BYTES)
  if (!response.ok) {
    const code = scannerErrorCode(body)
    throw new SecurityScannerClientError('安全扫描服务拒绝任务', response.status, code)
  }
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new SecurityScannerClientError('安全扫描服务返回格式无效', 502, 'SCANNER_REPORT_INVALID')
  return body
}

async function readBoundedBody(response: Response, maximum: number) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maximum)
    throw new SecurityScannerClientError('安全扫描服务响应过大', 502, 'SCANNER_REPORT_INVALID')
  if (!response.body)
    throw new SecurityScannerClientError('安全扫描服务响应为空', 502, 'SCANNER_REPORT_INVALID')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let result = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      size += chunk.value.byteLength
      if (size > maximum)
        throw new SecurityScannerClientError('安全扫描服务响应过大', 502, 'SCANNER_REPORT_INVALID')
      result += decoder.decode(chunk.value, { stream: true })
    }
    result += decoder.decode()
    return result
  }
  catch (error) {
    await reader.cancel().catch(() => undefined)
    if (error instanceof SecurityScannerClientError)
      throw error
    throw new SecurityScannerClientError('安全扫描服务响应编码无效', 502, 'SCANNER_REPORT_INVALID', { cause: error })
  }
}

function requiredEnvironment(name: string, maximum: number) {
  const value = process.env[name]?.normalize('NFC').trim()
  if (!value || value.length > maximum)
    throw new SecurityScannerClientError('安全扫描服务配置缺失', 503, 'SCANNER_CONFIG_INVALID')
  return value
}

function scannerErrorCode(body: string) {
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'code' in parsed
      && typeof parsed.code === 'string' && /^[A-Z][A-Z0-9_]{2,99}$/.test(parsed.code)) {
      return parsed.code
    }
  }
  catch {
    // The response body is intentionally not included in the error or logs.
  }
  return 'SCANNER_REQUEST_FAILED'
}

function scannerRuntime() {
  let baseUrl: URL
  try {
    baseUrl = new URL(requiredEnvironment('AI_SECURITY_SCANNER_URL', 2048))
  }
  catch (error) {
    if (error instanceof SecurityScannerClientError)
      throw error
    throw new SecurityScannerClientError('安全扫描服务地址无效', 503, 'SCANNER_CONFIG_INVALID', { cause: error })
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)
    || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
    || (baseUrl.pathname !== '' && baseUrl.pathname !== '/')) {
    throw new SecurityScannerClientError('安全扫描服务地址无效', 503, 'SCANNER_CONFIG_INVALID')
  }
  return {
    baseUrl,
    sharedSecret: requiredEnvironment('AI_SECURITY_SCANNER_SHARED_SECRET', 4096),
  }
}

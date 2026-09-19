import 'server-only'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { buildLlmEndpoint } from '@/lib/llm/protocol'
import { getLlmRuntimeConfig } from '@/lib/llm/settings'

import { verifyScannerJobToken } from '../runner/tokens'
import { normalizeGatewayChatRequest, SecurityGatewayRequestError } from './request'

import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_REQUEST_BYTES = 2 * 1024 * 1024
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 120_000

export interface SecurityGatewayServerOptions {
  host?: string
  port?: number
  sharedSecret?: string
}

export async function checkSecurityGatewayReadiness(sharedSecret = process.env.AI_SECURITY_SCANNER_SHARED_SECRET) {
  validateSharedSecret(sharedSecret)
  const config = await getLlmRuntimeConfig()
  if (config.protocol !== 'openai')
    throw new SecurityGatewayRequestError('Skill 扫描器当前只支持 OpenAI 兼容协议', 503, 'GATEWAY_PROTOCOL_UNSUPPORTED')
  return { model: config.model, protocol: config.protocol }
}

export function createSecurityGatewayServer(options: SecurityGatewayServerOptions = {}) {
  const host = normalizeHost(options.host ?? process.env.AI_SECURITY_GATEWAY_LISTEN_HOST ?? '127.0.0.1')
  const port = normalizePort(options.port ?? Number(process.env.AI_SECURITY_GATEWAY_LISTEN_PORT || 8092))
  const sharedSecret = options.sharedSecret ?? process.env.AI_SECURITY_SCANNER_SHARED_SECRET

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (request.method === 'GET' && request.url === '/health/live') {
        writeJson(response, 200, { status: 'live' })
        return
      }
      if (request.method === 'GET' && request.url === '/health/ready') {
        const readiness = await checkSecurityGatewayReadiness(sharedSecret)
        writeJson(response, 200, { ...readiness, status: 'ready' })
        return
      }
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        writeGatewayError(response, 404, 'GATEWAY_ROUTE_NOT_FOUND', '请求路径不存在')
        return
      }
      await handleChatCompletion(request, response, sharedSecret)
    }
    catch (error) {
      const known = error instanceof SecurityGatewayRequestError
      writeGatewayError(
        response,
        known ? error.status : 503,
        known ? error.code : 'GATEWAY_REQUEST_FAILED',
        known ? error.message : '安全评测模型网关暂不可用',
      )
    }
  })

  return {
    host,
    listen: () => new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.removeListener('error', reject)
        resolve()
      })
    }),
    port,
    server,
  }
}

function bearerToken(value: string | undefined) {
  if (!value?.startsWith('Bearer ') || value.length > 8200)
    throw new SecurityGatewayRequestError('缺少有效任务令牌', 401, 'GATEWAY_AUTH_FAILED')
  return value.slice(7)
}

async function handleChatCompletion(request: IncomingMessage, response: ServerResponse, sharedSecret: string | undefined) {
  const secret = validateSharedSecret(sharedSecret)
  const token = bearerToken(request.headers.authorization)
  let claims: ReturnType<typeof verifyScannerJobToken>
  try {
    claims = verifyScannerJobToken(token, secret)
  }
  catch {
    throw new SecurityGatewayRequestError('任务令牌无效或已过期', 401, 'GATEWAY_AUTH_FAILED')
  }

  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json'))
    throw new SecurityGatewayRequestError('请求必须使用 JSON', 415, 'GATEWAY_REQUEST_INVALID')
  const bytes = await readIncomingBody(request, MAX_REQUEST_BYTES)
  let input: unknown
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  catch {
    throw new SecurityGatewayRequestError('请求正文不是有效的 UTF-8 JSON', 400, 'GATEWAY_REQUEST_INVALID')
  }

  const config = await getLlmRuntimeConfig()
  if (config.protocol !== 'openai')
    throw new SecurityGatewayRequestError('Skill 扫描器当前只支持 OpenAI 兼容协议', 503, 'GATEWAY_PROTOCOL_UNSUPPORTED')
  if (claims.model !== config.model)
    throw new SecurityGatewayRequestError('任务模型与当前配置不匹配', 403, 'GATEWAY_MODEL_MISMATCH')
  const body = normalizeGatewayChatRequest(input, config.model)
  const controller = new AbortController()
  const abort = () => controller.abort()
  request.once('aborted', abort)
  response.once('close', abort)
  const timeout = setTimeout(abort, UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetch(buildLlmEndpoint(config.baseUrl, config.protocol), {
      body: JSON.stringify(body),
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'identity',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    }).catch((error) => {
      throw new SecurityGatewayRequestError('无法连接安全评测模型', 502, 'GATEWAY_UPSTREAM_UNAVAILABLE', { cause: error })
    })
    const result = await readFetchBody(upstream, MAX_RESPONSE_BYTES)
    const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.startsWith('application/json'))
      throw new SecurityGatewayRequestError('安全评测模型返回格式无效', 502, 'GATEWAY_UPSTREAM_INVALID')
    response.statusCode = upstream.status
    response.setHeader('Content-Length', String(result.byteLength))
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(result)
  }
  finally {
    clearTimeout(timeout)
    request.removeListener('aborted', abort)
    response.removeListener('close', abort)
  }
}

function normalizeHost(value: string) {
  const host = value.normalize('NFC').trim()
  if (!host || host.length > 255 || /\s/.test(host))
    throw new TypeError('Invalid AI security gateway listen host')
  return host
}

function normalizePort(value: number) {
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65_535)
    throw new TypeError('Invalid AI security gateway listen port')
  return value
}

async function readFetchBody(response: Response, maximum: number) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maximum)
    throw new SecurityGatewayRequestError('安全评测模型响应过大', 502, 'GATEWAY_UPSTREAM_INVALID')
  if (!response.body)
    return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const item = await reader.read()
    if (item.done)
      break
    size += item.value.byteLength
    if (size > maximum) {
      await reader.cancel().catch(() => undefined)
      throw new SecurityGatewayRequestError('安全评测模型响应过大', 502, 'GATEWAY_UPSTREAM_INVALID')
    }
    chunks.push(item.value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function readIncomingBody(request: IncomingMessage, maximum: number) {
  const declared = Number(request.headers['content-length'] || 0)
  if (!Number.isSafeInteger(declared) || declared < 1 || declared > maximum)
    throw new SecurityGatewayRequestError('请求正文大小无效', 413, 'GATEWAY_REQUEST_INVALID')
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > maximum) {
        request.destroy()
        reject(new SecurityGatewayRequestError('请求正文过大', 413, 'GATEWAY_REQUEST_INVALID'))
        return
      }
      chunks.push(chunk)
    })
    request.once('end', () => {
      if (size !== declared) {
        reject(new SecurityGatewayRequestError('请求正文不完整', 400, 'GATEWAY_REQUEST_INVALID'))
        return
      }
      resolve(Buffer.concat(chunks, size))
    })
    request.once('error', reject)
  })
}

function validateSharedSecret(value: string | undefined) {
  const secret = value?.normalize('NFC').trim() ?? ''
  const size = Buffer.byteLength(secret, 'utf8')
  if (size < 32 || size > 4096)
    throw new SecurityGatewayRequestError('安全评测共享密钥配置无效', 503, 'GATEWAY_CONFIG_INVALID')
  return secret
}

function writeGatewayError(response: ServerResponse, status: number, code: string, message: string) {
  if (response.headersSent || response.writableEnded)
    return
  writeJson(response, status, { error: { code, message, type: 'security_gateway_error' } })
}

function writeJson(response: ServerResponse, status: number, value: unknown) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  response.statusCode = status
  response.setHeader('Content-Length', String(body.byteLength))
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(body)
}

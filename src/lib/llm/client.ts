import 'server-only'

import { stripControlCharacters } from '../security'
import { buildLlmEndpoint } from './protocol'

import type { LlmProtocol } from '@/types'

const RESPONSE_LIMIT_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 30_000

export interface LlmPrompt {
  system: string
  user: string
}

export interface LlmRuntimeConfig {
  apiKey: string
  baseUrl: string
  model: string
  protocol: LlmProtocol
}

export interface LlmTextOptions {
  maxTokens?: number
  responseFormat?: 'json_object'
  thinking?: 'disabled' | 'enabled'
  timeoutMs?: number
}

export class LlmRequestError extends Error {
  constructor(message: string, readonly code = 'LLM_REQUEST_FAILED') {
    super(message)
  }
}

export async function callLlmText(config: LlmRuntimeConfig, prompt: LlmPrompt, options: LlmTextOptions = {}) {
  const endpoint = buildLlmEndpoint(config.baseUrl, config.protocol)
  const maxTokens = Math.max(160, Math.min(16_384, Math.trunc(options.maxTokens ?? 800)))
  const timeoutMs = Math.max(5_000, Math.min(120_000, Math.trunc(options.timeoutMs ?? REQUEST_TIMEOUT_MS)))
  const response = await fetch(endpoint, {
    body: JSON.stringify(buildRequestPayload(config, prompt, maxTokens, options)),
    headers: config.protocol === 'openai'
      ? {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        }
      : {
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
        },
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error) => {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new LlmRequestError('大模型请求超时', 'LLM_TIMEOUT')
    throw new LlmRequestError('无法连接大模型服务', 'LLM_CONNECTION_FAILED')
  })

  const raw = await readLimitedText(response)
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  }
  catch {
    throw new LlmRequestError('大模型返回了无效数据', 'LLM_INVALID_RESPONSE')
  }

  if (!response.ok) {
    const detail = providerErrorMessage(payload)
    throw new LlmRequestError(
      detail ? `大模型请求失败：${detail}` : `大模型请求失败（HTTP ${response.status}）`,
      `LLM_HTTP_${response.status}`,
    )
  }

  const text = config.protocol === 'openai'
    ? readOpenAiText(payload)
    : readAnthropicText(payload)
  if (!text) {
    const empty = config.protocol === 'openai' ? describeEmptyOpenAiResponse(payload) : null
    throw new LlmRequestError(
      empty?.message ?? '大模型没有返回文本内容',
      empty?.code ?? 'LLM_EMPTY_RESPONSE',
    )
  }
  return text.trim()
}

function buildRequestPayload(
  config: LlmRuntimeConfig,
  prompt: LlmPrompt,
  maxTokens: number,
  options: LlmTextOptions,
) {
  if (config.protocol === 'anthropic') {
    return {
      max_tokens: maxTokens,
      messages: [{ content: prompt.user, role: 'user' }],
      model: config.model,
      system: prompt.system,
    }
  }

  return {
    messages: [
      { content: prompt.system, role: 'system' },
      { content: prompt.user, role: 'user' },
    ],
    max_tokens: maxTokens,
    model: config.model,
    ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
    ...(options.thinking && isDeepSeekEndpoint(config.baseUrl)
      ? { thinking: { type: options.thinking } }
      : {}),
    stream: false,
  }
}

function describeEmptyOpenAiResponse(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0]))
    return null
  const choice = payload.choices[0]
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : ''
  const message = isRecord(choice.message) ? choice.message : null
  if (finishReason === 'length') {
    return {
      code: 'LLM_OUTPUT_TRUNCATED',
      message: '大模型输出达到长度上限，未生成完整的最终正文',
    }
  }
  if (finishReason === 'content_filter') {
    return {
      code: 'LLM_CONTENT_FILTERED',
      message: '大模型响应被内容安全策略过滤',
    }
  }
  if (finishReason === 'insufficient_system_resource') {
    return {
      code: 'LLM_PROVIDER_BUSY',
      message: '大模型服务资源不足，请稍后重试',
    }
  }
  if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return {
      code: 'LLM_FINAL_ANSWER_MISSING',
      message: '大模型仅返回了推理过程，没有生成最终正文',
    }
  }
  return null
}

function isDeepSeekEndpoint(baseUrl: string) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return hostname === 'deepseek.com' || hostname.endsWith('.deepseek.com')
  }
  catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function providerErrorMessage(payload: unknown) {
  if (!isRecord(payload))
    return ''
  const error = isRecord(payload.error) ? payload.error : payload
  const message = typeof error.message === 'string' ? error.message : ''
  return stripControlCharacters(message).trim().slice(0, 240)
}

function readAnthropicText(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.content))
    return ''
  return payload.content
    .filter(isRecord)
    .filter(item => item.type === 'text')
    .map(item => typeof item.text === 'string' ? item.text : '')
    .join('')
}

async function readLimitedText(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > RESPONSE_LIMIT_BYTES)
    throw new LlmRequestError('大模型响应内容过大', 'LLM_RESPONSE_TOO_LARGE')
  if (!response.body)
    return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > RESPONSE_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new LlmRequestError('大模型响应内容过大', 'LLM_RESPONSE_TOO_LARGE')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function readOpenAiText(payload: unknown) {
  if (!isRecord(payload))
    return ''
  if (typeof payload.output_text === 'string')
    return payload.output_text

  const choice = Array.isArray(payload.choices) && isRecord(payload.choices[0])
    ? payload.choices[0]
    : null
  const message = choice && isRecord(choice.message) ? choice.message : null
  if (typeof message?.content === 'string')
    return message.content
  if (Array.isArray(message?.content)) {
    return message.content
      .filter(isRecord)
      .map(item => typeof item.text === 'string' ? item.text : '')
      .join('')
  }

  if (Array.isArray(payload.output)) {
    return payload.output
      .filter(isRecord)
      .flatMap(item => Array.isArray(item.content) ? item.content.filter(isRecord) : [])
      .map(item => typeof item.text === 'string' ? item.text : '')
      .join('')
  }
  return ''
}

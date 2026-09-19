const ALLOWED_REQUEST_KEYS = new Set([
  'frequency_penalty',
  'max_completion_tokens',
  'max_tokens',
  'messages',
  'model',
  'parallel_tool_calls',
  'presence_penalty',
  'response_format',
  'seed',
  'stop',
  'stream',
  'temperature',
  'tool_choice',
  'tools',
  'top_p',
])

export class SecurityGatewayRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export function normalizeGatewayChatRequest(value: unknown, expectedModel: string) {
  if (!isRecord(value))
    invalid('请求正文必须是 JSON 对象')
  for (const key of Object.keys(value)) {
    if (!ALLOWED_REQUEST_KEYS.has(key))
      invalid(`不支持的请求字段：${stripControlCharacters(key).slice(0, 80)}`)
  }
  if (value.model !== expectedModel)
    throw new SecurityGatewayRequestError('任务模型与当前配置不匹配', 403, 'GATEWAY_MODEL_MISMATCH')
  if (value.stream === true)
    invalid('扫描评测不允许流式响应')
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 200)
    invalid('消息列表无效')
  validateMessages(value.messages)
  validateTools(value.tools)
  validateOptionalNumber(value.temperature, 'temperature', 0, 2)
  validateOptionalNumber(value.top_p, 'top_p', 0, 1)
  validateOptionalNumber(value.frequency_penalty, 'frequency_penalty', -2, 2)
  validateOptionalNumber(value.presence_penalty, 'presence_penalty', -2, 2)
  validateOptionalInteger(value.max_tokens, 'max_tokens', 1, 16_384)
  validateOptionalInteger(value.max_completion_tokens, 'max_completion_tokens', 1, 16_384)
  validateOptionalInteger(value.seed, 'seed', -2_147_483_648, 2_147_483_647)

  return {
    ...value,
    model: expectedModel,
    stream: false,
  }
}

function invalid(message: string): never {
  throw new SecurityGatewayRequestError(message, 400, 'GATEWAY_REQUEST_INVALID')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripControlCharacters(value: string) {
  return [...value].filter((character) => {
    const point = character.codePointAt(0) ?? 0
    return point === 9 || point === 10 || point === 13 || (point > 31 && point !== 127)
  }).join('')
}

function validateMessages(messages: unknown[]) {
  for (const message of messages) {
    if (!isRecord(message) || typeof message.role !== 'string' || message.role.length > 30)
      invalid('消息格式无效')
    if (!['assistant', 'system', 'tool', 'user'].includes(message.role))
      invalid('消息角色无效')
    if (typeof message.content !== 'string' && !Array.isArray(message.content) && message.content !== null)
      invalid('消息内容格式无效')
    if (typeof message.content === 'string' && message.content.length > 500_000)
      invalid('单条消息内容过大')
    if (Array.isArray(message.content) && message.content.length > 100)
      invalid('消息内容分段过多')
  }
}

function validateOptionalInteger(value: unknown, field: string, minimum: number, maximum: number) {
  if (value === undefined)
    return
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
    invalid(`${field} 超出允许范围`)
}

function validateOptionalNumber(value: unknown, field: string, minimum: number, maximum: number) {
  if (value === undefined)
    return
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    invalid(`${field} 超出允许范围`)
}

function validateTools(value: unknown) {
  if (value === undefined)
    return
  if (!Array.isArray(value) || value.length > 64)
    invalid('工具定义无效')
  for (const tool of value) {
    if (!isRecord(tool) || tool.type !== 'function' || !isRecord(tool.function))
      invalid('工具定义无效')
    const name = tool.function.name
    if (typeof name !== 'string' || !/^[\w-]{1,64}$/.test(name))
      invalid('工具名称无效')
  }
}

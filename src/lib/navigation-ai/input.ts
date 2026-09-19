import { stripControlCharacters } from '../security'

import type { NavigationAiMessage } from './types'

const MAX_MESSAGES = 8
const MAX_USER_LENGTH = 500
const MAX_ASSISTANT_LENGTH = 1_200
const MAX_TOTAL_LENGTH = 4_000

export class NavigationAiInputError extends Error {
  readonly code = 'NAVIGATION_AI_INPUT_INVALID'
  readonly status = 400
}

export function normalizeNavigationAiMessages(value: unknown): NavigationAiMessage[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new NavigationAiInputError('请输入你想找的网站')
  if (value.length > MAX_MESSAGES)
    throw new NavigationAiInputError('本次对话内容过长，请开始新的搜索')

  const messages = value.map((item) => {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string')
      throw new NavigationAiInputError('对话格式无效')
    const role: NavigationAiMessage['role'] = item.role
    const content = stripControlCharacters(item.content).trim()
    const limit = role === 'user' ? MAX_USER_LENGTH : MAX_ASSISTANT_LENGTH
    if (!content || content.length > limit)
      throw new NavigationAiInputError(role === 'user' ? '每次输入不能超过 500 个字符' : '对话格式无效')
    return { content, role }
  })

  if (messages.at(-1)?.role !== 'user')
    throw new NavigationAiInputError('请输入新的找站需求')
  if (messages.reduce((total, message) => total + message.content.length, 0) > MAX_TOTAL_LENGTH)
    throw new NavigationAiInputError('本次对话内容过长，请开始新的搜索')

  return messages
}

export function parseLlmJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim()
  const firstLineEnd = trimmed.indexOf('\n')
  const closingFence = trimmed.lastIndexOf('```')
  const candidate = trimmed.startsWith('```') && firstLineEnd > 0 && closingFence > firstLineEnd
    ? trimmed.slice(firstLineEnd + 1, closingFence).trim()
    : trimmed
  try {
    const parsed: unknown = JSON.parse(candidate)
    return isRecord(parsed) ? parsed : null
  }
  catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start)
      return null
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
      return isRecord(parsed) ? parsed : null
    }
    catch {
      return null
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

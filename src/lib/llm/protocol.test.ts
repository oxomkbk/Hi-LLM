import { describe, expect, it } from 'vitest'

import { constrainDescription, descriptionLength } from './description-text'
import { buildLlmEndpoint } from './protocol'

describe('llm protocol compatibility', () => {
  it('builds OpenAI-compatible and Anthropic endpoints from common base URLs', () => {
    expect(buildLlmEndpoint('https://api.openai.com/v1', 'openai'))
      .toBe('https://api.openai.com/v1/chat/completions')
    expect(buildLlmEndpoint('https://gateway.example.com/proxy/v1', 'anthropic'))
      .toBe('https://gateway.example.com/proxy/v1/messages')
    expect(buildLlmEndpoint('https://gateway.example.com/openai', 'openai'))
      .toBe('https://gateway.example.com/openai/chat/completions')
  })

  it('constrains generated website descriptions to 30-40 characters', () => {
    const short = constrainDescription('在线工具网站。')
    const long = constrainDescription('这是一个用于测试超长输出截断能力的网站介绍，它包含了远远超过四十个字符的冗长文字并且不应该完整保留。')
    expect(descriptionLength(short)).toBeGreaterThanOrEqual(30)
    expect(descriptionLength(short)).toBeLessThanOrEqual(40)
    expect(descriptionLength(long)).toBeGreaterThanOrEqual(30)
    expect(descriptionLength(long)).toBeLessThanOrEqual(40)
  })
})

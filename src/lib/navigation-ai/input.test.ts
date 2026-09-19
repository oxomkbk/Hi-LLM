import { describe, expect, it } from 'vitest'

import { NavigationAiInputError, normalizeNavigationAiMessages, parseLlmJson } from './input'

describe('navigation AI input', () => {
  it('normalizes a short multi-turn conversation', () => {
    expect(normalizeNavigationAiMessages([
      { role: 'user', content: ' 找视频工具 ' },
      { role: 'assistant', content: '你更偏向生成还是剪辑？' },
      { role: 'user', content: '生成，最好支持中文' },
    ])).toEqual([
      { role: 'user', content: '找视频工具' },
      { role: 'assistant', content: '你更偏向生成还是剪辑？' },
      { role: 'user', content: '生成，最好支持中文' },
    ])
  })

  it('requires the latest message to come from the user', () => {
    expect(() => normalizeNavigationAiMessages([
      { role: 'assistant', content: '需要什么网站？' },
    ])).toThrow(NavigationAiInputError)
  })

  it('parses fenced provider JSON without trusting surrounding prose', () => {
    expect(parseLlmJson('```json\n{"keywords":["视频"]}\n```')).toEqual({ keywords: ['视频'] })
  })
})

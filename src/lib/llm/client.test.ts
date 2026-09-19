import { afterEach, describe, expect, it, vi } from 'vitest'

import { callLlmText } from './client'

vi.mock('server-only', () => ({}))

const PROMPT = { system: 'Return JSON.', user: 'Evaluate this input.' }

afterEach(() => vi.unstubAllGlobals())

describe('llm text client', () => {
  it('uses DeepSeek non-thinking JSON mode for structured calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLlmText({
      apiKey: 'secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      protocol: 'openai',
    }, PROMPT, {
      responseFormat: 'json_object',
      thinking: 'disabled',
    })).resolves.toBe('{"ok":true}')

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('does not send provider-specific thinking parameters to regular OpenAI endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'ok' } }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await callLlmText({
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-compatible',
      protocol: 'openai',
    }, PROMPT, { thinking: 'disabled' })

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(String(init.body))).not.toHaveProperty('thinking')
  })

  it('reports truncated and reasoning-only responses with actionable error codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: 'hidden' } }],
    })).mockResolvedValueOnce(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: null, reasoning_content: 'hidden' } }],
    })))
    const config = {
      apiKey: 'secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      protocol: 'openai' as const,
    }

    await expect(callLlmText(config, PROMPT)).rejects.toMatchObject({
      code: 'LLM_OUTPUT_TRUNCATED',
      message: '大模型输出达到长度上限，未生成完整的最终正文',
    })
    await expect(callLlmText(config, PROMPT)).rejects.toMatchObject({
      code: 'LLM_FINAL_ANSWER_MISSING',
      message: '大模型仅返回了推理过程，没有生成最终正文',
    })
  })
})

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

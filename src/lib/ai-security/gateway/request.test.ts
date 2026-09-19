import { describe, expect, it } from 'vitest'

import { normalizeGatewayChatRequest } from './request'

describe('security LLM gateway request policy', () => {
  it('keeps the scanner tool-call fields while forcing a non-streaming fixed model', () => {
    expect(normalizeGatewayChatRequest({
      messages: [{ content: 'inspect the skill', role: 'user' }],
      model: 'security-model',
      stream: false,
      tool_choice: 'auto',
      tools: [{ function: { name: 'read_file', parameters: { type: 'object' } }, type: 'function' }],
    }, 'security-model')).toEqual(expect.objectContaining({ model: 'security-model', stream: false }))
  })

  it('rejects model changes, streaming and unrecognized controls', () => {
    expect(() => normalizeGatewayChatRequest({ messages: [{ content: 'x', role: 'user' }], model: 'other' }, 'security-model'))
      .toThrowError(expect.objectContaining({ code: 'GATEWAY_MODEL_MISMATCH' }))
    expect(() => normalizeGatewayChatRequest({ messages: [{ content: 'x', role: 'user' }], model: 'security-model', stream: true }, 'security-model'))
      .toThrowError(expect.objectContaining({ code: 'GATEWAY_REQUEST_INVALID' }))
    expect(() => normalizeGatewayChatRequest({ messages: [{ content: 'x', role: 'user' }], model: 'security-model', user: 'attacker' }, 'security-model'))
      .toThrowError(expect.objectContaining({ code: 'GATEWAY_REQUEST_INVALID' }))
  })
})

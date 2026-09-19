import { describe, expect, it } from 'vitest'

import { requiresLlmApiKeyReentry } from './settings-security'

describe('llm settings secret re-entry policy', () => {
  it('requires a new key when the endpoint or protocol changes', () => {
    expect(requiresLlmApiKeyReentry({
      existing: { baseUrl: 'https://old.example/v1', protocol: 'openai' },
      next: { baseUrl: 'https://new.example/v1', protocol: 'openai' },
      suppliedKey: '',
    })).toBe(true)
    expect(requiresLlmApiKeyReentry({
      existing: { baseUrl: 'https://old.example/v1', protocol: 'openai' },
      next: { baseUrl: 'https://old.example/v1', protocol: 'anthropic' },
      suppliedKey: '',
    })).toBe(true)
  })

  it('keeps blank-key saves compatible when the endpoint is unchanged', () => {
    expect(requiresLlmApiKeyReentry({
      existing: { baseUrl: 'https://same.example/v1', protocol: 'openai' },
      next: { baseUrl: 'https://same.example/v1', protocol: 'openai' },
      suppliedKey: '',
    })).toBe(false)
    expect(requiresLlmApiKeyReentry({
      existing: null,
      next: { baseUrl: 'https://new.example/v1', protocol: 'openai' },
      suppliedKey: '',
    })).toBe(false)
  })

  it('does not require re-entry when a new key is supplied', () => {
    expect(requiresLlmApiKeyReentry({
      existing: { baseUrl: 'https://old.example/v1', protocol: 'openai' },
      next: { baseUrl: 'https://new.example/v1', protocol: 'openai' },
      suppliedKey: 'new-secret',
    })).toBe(false)
  })
})

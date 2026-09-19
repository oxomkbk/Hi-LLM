import { describe, expect, it } from 'vitest'

import { createLlmRuntimeIdentity, securityModeForSubject } from './settings'

describe('aI security settings identity', () => {
  it('normalizes equivalent LLM base URLs', () => {
    const first = createLlmRuntimeIdentity({
      apiKey: 'first-secret',
      baseUrl: 'https://API.EXAMPLE.com/v1/',
      model: 'safe-model',
      protocol: 'openai',
    })
    const second = createLlmRuntimeIdentity({
      apiKey: 'rotated-secret',
      baseUrl: 'https://api.example.com:443/v1',
      model: 'safe-model',
      protocol: 'openai',
    })

    expect(first.fingerprint).toBe(second.fingerprint)
    expect(JSON.stringify(first)).not.toContain('secret')
  })

  it('changes identity when the model or inference parameters change', () => {
    const baseline = createLlmRuntimeIdentity({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      parameters: { temperature: 0 },
      protocol: 'openai',
    })
    const changed = createLlmRuntimeIdentity({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-b',
      parameters: { temperature: 0 },
      protocol: 'openai',
    })

    expect(baseline.fingerprint).not.toBe(changed.fingerprint)
  })

  it('maps submission subjects to their public content policy', () => {
    const settings = { mcpMode: 'warn', promptMode: 'enforce', skillMode: 'observe' } as const
    expect(securityModeForSubject(settings, 'skill_submission')).toBe('observe')
    expect(securityModeForSubject(settings, 'mcp_submission')).toBe('warn')
    expect(securityModeForSubject(settings, 'prompt')).toBe('enforce')
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import { isSecurityWorkerLocalOnly, shouldUseSecurityLlm } from './runtime-mode'

const ORIGINAL = process.env.AI_SECURITY_LOCAL_ONLY

afterEach(() => {
  if (ORIGINAL === undefined)
    delete process.env.AI_SECURITY_LOCAL_ONLY
  else
    process.env.AI_SECURITY_LOCAL_ONLY = ORIGINAL
})

describe('security worker runtime mode', () => {
  it.each([undefined, '', 'true', ' TRUE '])('fails closed for %s', (value) => {
    if (value === undefined)
      delete process.env.AI_SECURITY_LOCAL_ONLY
    else
      process.env.AI_SECURITY_LOCAL_ONLY = value

    expect(isSecurityWorkerLocalOnly()).toBe(true)
  })

  it('allows configured remote assistance only when explicitly disabled', () => {
    process.env.AI_SECURITY_LOCAL_ONLY = ' FaLsE '

    expect(isSecurityWorkerLocalOnly()).toBe(false)
  })

  it('does not load paid LLM configuration for configured jobs under the safe default', () => {
    delete process.env.AI_SECURITY_LOCAL_ONLY
    expect(shouldUseSecurityLlm('configured')).toBe(false)
    process.env.AI_SECURITY_LOCAL_ONLY = 'false'
    expect(shouldUseSecurityLlm('configured')).toBe(true)
    expect(shouldUseSecurityLlm('local_deterministic')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import {
  emailMatchesAllowlist,
  normalizeEmailAccessMode,
  normalizeEmailAllowlist,
} from './email-allowlist'

describe('email access allowlist', () => {
  it('normalizes, removes duplicates and keeps exact email rules', () => {
    expect(normalizeEmailAllowlist([' Admin@Example.com ', 'admin@example.com', '@Example.com'])).toEqual([
      'admin@example.com',
      '@example.com',
    ])
  })

  it('matches exact addresses and domain rules', () => {
    const rules = ['owner@outside.test', '@example.com']
    expect(emailMatchesAllowlist('OWNER@outside.test', rules)).toBe(true)
    expect(emailMatchesAllowlist('member@example.com', rules)).toBe(true)
    expect(emailMatchesAllowlist('member@sub.example.com', rules)).toBe(false)
  })

  it('rejects invalid rules and modes', () => {
    expect(() => normalizeEmailAllowlist(['example.com'])).toThrow('白名单规则无效')
    expect(() => normalizeEmailAccessMode('closed')).toThrow('邮箱访问模式无效')
  })
})

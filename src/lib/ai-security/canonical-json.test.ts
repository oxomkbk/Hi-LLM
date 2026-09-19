import { describe, expect, it } from 'vitest'

import { canonicalJson, normalizeSecurityPath, sha256Canonical } from './canonical-json'

describe('canonical security serialization', () => {
  it('sorts object keys and normalizes unicode recursively', () => {
    expect(canonicalJson({ z: 'e\u0301', a: [{ y: 2, x: 1 }] }))
      .toBe('{"a":[{"x":1,"y":2}],"z":"é"}')
  })

  it('produces identical hashes for semantically identical objects', () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }))
  })

  it('normalizes safe archive paths and rejects traversal', () => {
    expect(normalizeSecurityPath('styles\\theme.css')).toBe('styles/theme.css')
    expect(() => normalizeSecurityPath('../secret.txt')).toThrow('SECURITY_INVALID_PATH')
    expect(() => normalizeSecurityPath('/etc/passwd')).toThrow('SECURITY_INVALID_PATH')
  })
})

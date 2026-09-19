import { describe, expect, it } from 'vitest'

import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH, isStrongPassword } from './password-policy'

describe('authentication password policy', () => {
  it('uses one shared length policy for every credential entry point', () => {
    expect(AUTH_MIN_PASSWORD_LENGTH).toBe(12)
    expect(AUTH_MAX_PASSWORD_LENGTH).toBe(64)
    expect(isStrongPassword('Abcdefgh1234')).toBe(true)
    expect(isStrongPassword('Abc123')).toBe(false)
    expect(isStrongPassword('abcdefgh1234')).toBe(false)
  })
})

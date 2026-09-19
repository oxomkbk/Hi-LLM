import { describe, expect, it } from 'vitest'

import { requiresSmtpPasswordReentry } from './settings-security'

describe('smtp settings secret re-entry policy', () => {
  it('requires a new password when connection identity changes', () => {
    expect(requiresSmtpPasswordReentry({
      existing: { encryption: 'tls', host: 'old.example', port: 465, username: 'mailer' },
      next: { encryption: 'tls', host: 'new.example', port: 465, username: 'mailer' },
      suppliedPassword: '',
    })).toBe(true)
    expect(requiresSmtpPasswordReentry({
      existing: { encryption: 'tls', host: 'old.example', port: 465, username: 'mailer' },
      next: { encryption: 'starttls', host: 'old.example', port: 465, username: 'mailer' },
      suppliedPassword: '',
    })).toBe(true)
  })

  it('keeps blank-password saves compatible when connection identity is unchanged', () => {
    expect(requiresSmtpPasswordReentry({
      existing: { encryption: 'tls', host: 'same.example', port: 465, username: 'mailer' },
      next: { encryption: 'tls', host: 'same.example', port: 465, username: 'mailer' },
      suppliedPassword: '',
    })).toBe(false)
    expect(requiresSmtpPasswordReentry({
      existing: null,
      next: { encryption: 'tls', host: 'new.example', port: 465, username: 'mailer' },
      suppliedPassword: '',
    })).toBe(false)
  })

  it('does not require re-entry when a new password is supplied', () => {
    expect(requiresSmtpPasswordReentry({
      existing: { encryption: 'tls', host: 'old.example', port: 465, username: 'mailer' },
      next: { encryption: 'tls', host: 'new.example', port: 465, username: 'mailer' },
      suppliedPassword: 'new-secret',
    })).toBe(false)
  })
})

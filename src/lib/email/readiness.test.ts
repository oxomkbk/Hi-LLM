import { describe, expect, it } from 'vitest'

import { isEmailRegistrationReady } from './readiness'

const checked = {
  lastCheckAt: '2026-09-02T03:10:00.000Z',
  lastCheckOk: true,
  updatedAt: '2026-09-02T03:09:00.000Z',
}

describe('email registration readiness', () => {
  it('rejects an unconfigured email service', () => {
    expect(isEmailRegistrationReady({
      host: '',
      mode: 'unconfigured',
      passwordConfigured: false,
      source: 'unconfigured',
      ...checked,
    }, 'production')).toBe(false)
  })

  it('allows the existing local console mode outside production', () => {
    expect(isEmailRegistrationReady({
      host: '',
      mode: 'console',
      passwordConfigured: false,
      source: 'console',
      ...checked,
    }, 'development')).toBe(true)
  })

  it('rejects console mode in production', () => {
    expect(isEmailRegistrationReady({
      host: '',
      mode: 'console',
      passwordConfigured: false,
      source: 'console',
      ...checked,
    }, 'production')).toBe(false)
  })

  it('requires a successful check after a database configuration change', () => {
    expect(isEmailRegistrationReady({
      host: 'smtp.example.com',
      mode: 'smtp',
      passwordConfigured: true,
      source: 'database',
      lastCheckAt: '2026-09-02T03:08:00.000Z',
      lastCheckOk: true,
      updatedAt: '2026-09-02T03:09:00.000Z',
    }, 'production')).toBe(false)
  })

  it('accepts a tested database or environment SMTP configuration', () => {
    expect(isEmailRegistrationReady({
      host: 'smtp.example.com',
      mode: 'smtp',
      passwordConfigured: true,
      source: 'database',
      ...checked,
    }, 'production')).toBe(true)
    expect(isEmailRegistrationReady({
      host: 'smtp.example.com',
      mode: 'smtp',
      passwordConfigured: true,
      source: 'environment',
      lastCheckAt: null,
      lastCheckOk: null,
      updatedAt: null,
    }, 'production')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import {
  EmailRecipientValidationError,
  EmailTestRequestValidationError,
  normalizeEmailSettingsInput,
  normalizeEmailTestRequest,
  normalizeTestEmailRecipient,
} from './settings-validation'

describe('normalizeEmailSettingsInput', () => {
  it('normalizes a secure smtp configuration', () => {
    expect(normalizeEmailSettingsInput({
      encryption: 'tls',
      fromEmail: ' Admin@Example.com ',
      fromName: '内容中心',
      host: ' SMTP.Example.com ',
      password: 'secret',
      port: '465',
      username: 'mailer@example.com',
    })).toEqual({
      encryption: 'tls',
      fromEmail: 'admin@example.com',
      fromName: '内容中心',
      host: 'smtp.example.com',
      password: 'secret',
      port: 465,
      username: 'mailer@example.com',
    })
  })

  it.each([
    ['http://smtp.example.com', 465, 'tls'],
    ['smtp.example.com/path', 465, 'tls'],
    ['smtp.example.com', 0, 'tls'],
    ['smtp.example.com', 465, 'none'],
  ])('rejects unsafe or invalid transport input', (host, port, encryption) => {
    expect(() => normalizeEmailSettingsInput({
      encryption,
      fromEmail: 'admin@example.com',
      fromName: '内容中心',
      host,
      password: 'secret',
      port,
      username: 'mailer@example.com',
    })).toThrow()
  })
})

describe('test email recipient validation', () => {
  it('normalizes one mailbox without restricting it to a site account', () => {
    expect(normalizeTestEmailRecipient('  Admin+SMTP@Example.com ')).toBe('Admin+SMTP@example.com')
    expect(normalizeEmailTestRequest({ recipient: ' Test@Example.com ' }))
      .toEqual({ recipient: 'Test@example.com' })
    expect(normalizeTestEmailRecipient('用户@例子.中国'))
      .toBe('用户@xn--fsqu00a.xn--fiqs8s')
    expect(normalizeTestEmailRecipient('admin@example')).toBe('admin@example')
  })

  it.each([
    '',
    'HiLLM <admin@example.com>',
    'a@example.com,b@example.com',
    'a@example.com; b@example.com',
    '.admin@example.com',
    'admin..test@example.com',
    'admin@-example.com',
    `admin@${'a'.repeat(64)}.com`,
    'admin@example.com\nBcc: victim@example.com',
    'admin@example.com\u0085Bcc:victim@example.com',
    'admin\uD800@example.com',
    `${'用'.repeat(22)}@example.com`,
    `${'a'.repeat(65)}@example.com`,
    `${'a'.repeat(245)}@example.com`,
  ])('rejects an invalid or unsafe mailbox: %s', (recipient) => {
    expect(() => normalizeTestEmailRecipient(recipient)).toThrow(EmailRecipientValidationError)
  })

  it.each([
    null,
    [],
    {},
    { recipient: 123 },
    { recipient: 'admin@example.com', subject: 'custom' },
  ])('rejects a malformed test request', (input) => {
    expect(() => normalizeEmailTestRequest(input)).toThrow(EmailTestRequestValidationError)
  })
})

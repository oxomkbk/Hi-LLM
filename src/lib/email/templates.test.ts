import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  createEmailVerificationTemplate,
  createPasswordResetTemplate,
  createSmtpTestTemplate,
  EmailTemplateError,
} from './templates'

describe('email templates', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.hillm.ai')
    vi.stubEnv('BETTER_AUTH_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders an accessible verification email with matching HTML and text actions', () => {
    const template = createEmailVerificationTemplate({
      actionUrl: 'https://www.hillm.ai/api/auth/verify-email?token=a%26b',
    })

    expect(template.subject).toContain('验证')
    expect(template.text).toContain('https://www.hillm.ai/api/auth/verify-email?token=a%26b')
    expect(template.html).toContain('<html lang="zh-CN">')
    expect(template.html).toContain('<meta charset="utf-8">')
    expect(template.html).toContain('name="viewport"')
    expect(template.html).toContain('role="presentation"')
    expect(template.html).toContain('padding:14px 24px')
    expect(template.html).toContain('word-break:break-all')
    expect(template.html).toContain('token=a%26b')
    expect(template.html).not.toContain('<img')
  })

  it('renders the password reset action and escapes URL attributes', () => {
    const template = createPasswordResetTemplate({
      actionUrl: 'https://www.hillm.ai/reset-password?callback=%22%3E%3Cscript%3E',
    })

    expect(template.text).toContain('重置链接：')
    expect(template.html).not.toContain('<script>')
    expect(template.html).toContain('callback=%22%3E%3Cscript%3E')
  })

  it.each([
    'javascript:alert(1)',
    'https://user:secret@www.hillm.ai/reset',
    'https://attacker.example/reset',
    'https://www.hillm.ai/reset\nBcc: victim@example.com',
  ])('rejects an unsafe action URL: %s', (actionUrl) => {
    expect(() => createPasswordResetTemplate({ actionUrl })).toThrow(EmailTemplateError)
  })

  it('renders SMTP diagnostics without transport credentials', () => {
    const template = createSmtpTestTemplate({
      encryption: 'starttls',
      fromEmail: 'notice@example.com',
      fromName: 'HiLLM <运营>',
      sentAt: '2026-09-11T08:30:00.000Z',
    })

    expect(template.subject).toBe('HiLLM 邮件服务测试成功')
    expect(template.text).toContain('STARTTLS 升级加密')
    expect(template.html).toContain('HiLLM &lt;运营&gt;')
    expect(template.html).not.toContain('smtp.example.com')
    expect(template.html).not.toContain('password')
    expect(template.html).not.toContain('username')
  })
})

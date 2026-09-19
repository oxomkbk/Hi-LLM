import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { EmailSettingsError, sendTestEmail, testSavedEmailSettings } from './settings'

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  sendMail: vi.fn(),
  sessionQuery: vi.fn(),
  sessionRelease: vi.fn(),
  settingsRow: null as Record<string, unknown> | null,
  transactionRow: null as Record<string, unknown> | null,
  verify: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mocks.sendMail, verify: mocks.verify }),
  },
}))
vi.mock('@/lib/db/config-crypto', () => ({
  decryptConfig: () => ({ password: 'smtp-secret' }),
  encryptConfig: () => ({ ciphertext: 'next', iv: 'iv', tag: 'tag', version: 1 }),
}))
vi.mock('@/lib/db/control', () => ({
  getControlPool: () => ({
    connect: async () => ({ query: mocks.sessionQuery, release: mocks.sessionRelease }),
    query: mocks.poolQuery,
  }),
  withControlTransaction: async (callback: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => callback({
    query: mocks.clientQuery,
  }),
}))

const BASE_ROW = {
  encrypted_password: { ciphertext: 'cipher', iv: 'iv', tag: 'tag', version: 1 },
  encryption: 'tls',
  from_email: 'notice@example.com',
  from_name: 'HiLLM',
  host: 'smtp.example.com',
  last_check_at: null,
  last_check_code: null,
  last_check_ok: null,
  port: 465,
  updated_at: new Date('2026-09-11T08:00:00.000Z'),
  username: 'mailer@example.com',
}

function createSmtpFailure(input: Record<string, unknown>) {
  return Object.assign(new Error('upstream response contains private diagnostics'), input)
}

describe('saved email delivery diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsRow = { ...BASE_ROW }
    mocks.transactionRow = { ...BASE_ROW }
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from control.email_settings'))
        return { rows: mocks.settingsRow ? [mocks.settingsRow] : [] }
      return { rows: [] }
    })
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from control.email_settings'))
        return { rows: mocks.transactionRow ? [mocks.transactionRow] : [] }
      if (sql.includes('returning last_check_at'))
        return { rows: [{ last_check_at: new Date('2026-09-11T08:30:00.000Z') }] }
      return { rows: [] }
    })
    mocks.sessionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ locked: true }] }
      if (sql.includes('pg_advisory_unlock'))
        return { rows: [{ unlocked: true }] }
      return { rows: [] }
    })
    mocks.sendMail.mockResolvedValue({
      accepted: ['admin@example.com'],
      messageId: '<trace@example.com>',
      rejected: [],
      response: '250 private upstream response',
    })
    mocks.verify.mockResolvedValue(true)
  })

  it('sends the professional HTML and text template to exactly one address object', async () => {
    mocks.sendMail.mockResolvedValue({
      accepted: ['Admin@example.com'],
      messageId: '<trace\r\n@example.com>',
      rejected: [],
      response: '250 private upstream response',
    })
    const result = await sendTestEmail('Admin@Example.com', 'admin-1')

    expect(result).toMatchObject({
      recipient: 'Admin@example.com',
      source: 'database',
      status: 'queued',
    })
    expect(result).toMatchObject({
      deliveryConfirmed: false,
      messageId: '<trace@example.com>',
      queuedAt: '2026-09-11T08:30:00.000Z',
    })
    expect(result).not.toHaveProperty('response')
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      envelope: {
        from: 'mailer@example.com',
        to: ['Admin@example.com'],
      },
      from: { address: 'mailer@example.com', name: 'HiLLM' },
      html: expect.stringContaining('邮件投递链路工作正常'),
      replyTo: { address: 'notice@example.com' },
      text: expect.stringContaining('HiLLM 邮件服务测试成功'),
      to: { address: 'Admin@example.com' },
    }))
    const auditCalls = mocks.poolQuery.mock.calls.filter(([sql]) => String(sql).includes('email_settings.test_send'))
    expect(JSON.stringify(auditCalls)).not.toContain('admin@example.com')
    expect(JSON.stringify(auditCalls)).not.toContain('smtp-secret')
  })

  it('only blocks a truly overlapping send and applies no cooldown', async () => {
    mocks.sessionQuery.mockResolvedValueOnce({ rows: [{ locked: false }] })
    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code: 'EMAIL_TEST_ALREADY_RUNNING', status: 409 })
    expect(mocks.sendMail).not.toHaveBeenCalled()

    await expect(sendTestEmail('admin@example.com', 'admin-1')).resolves.toMatchObject({ status: 'queued' })
    await expect(sendTestEmail('admin@example.com', 'admin-1')).resolves.toMatchObject({ status: 'queued' })
    expect(mocks.sendMail).toHaveBeenCalledTimes(2)
  })

  it('falls back to the configured sender when the SMTP username is not a mailbox', async () => {
    mocks.settingsRow = { ...BASE_ROW, username: 'smtp-api-token' }
    mocks.transactionRow = { ...BASE_ROW, username: 'smtp-api-token' }
    mocks.sendMail.mockResolvedValue({ accepted: ['admin@example.com'], rejected: [] })

    await sendTestEmail('admin@example.com', 'admin-1')

    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      envelope: {
        from: 'notice@example.com',
        to: ['admin@example.com'],
      },
      from: { address: 'notice@example.com', name: 'HiLLM' },
    }))
    expect(mocks.sendMail.mock.calls[0]?.[0]).not.toHaveProperty('replyTo')
  })

  it('does not add a redundant reply-to when the authenticated sender matches the configured sender', async () => {
    mocks.settingsRow = { ...BASE_ROW, from_email: 'mailer@example.com' }
    mocks.transactionRow = { ...BASE_ROW, from_email: 'mailer@example.com' }

    await sendTestEmail('admin@example.com', 'admin-1')

    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      envelope: { from: 'mailer@example.com', to: ['admin@example.com'] },
      from: { address: 'mailer@example.com', name: 'HiLLM' },
    }))
    expect(mocks.sendMail.mock.calls[0]?.[0]).not.toHaveProperty('replyTo')
  })

  it('sanitizes and limits the returned Message-ID', async () => {
    mocks.sendMail.mockResolvedValue({
      accepted: ['admin@example.com'],
      messageId: ` <trace\r\n@example.com>${'x'.repeat(400)}`,
      rejected: [],
      response: '250 secret diagnostics',
    })

    const result = await sendTestEmail('admin@example.com', 'admin-1')

    expect(result.messageId).toHaveLength(320)
    expect(result.messageId).not.toMatch(/[\r\n]/)
    expect(result).not.toHaveProperty('response')
  })

  it('rejects a resolved send that did not accept the unique recipient', async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: ['admin@example.com'] })

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code: 'EMAIL_TEST_RECIPIENT_REJECTED' })
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('update control.email_settings')))
      .toBe(false)
  })

  it('accepts address objects and ignores unrelated rejected recipients', async () => {
    mocks.sendMail.mockResolvedValue({
      accepted: [{ address: ' admin@EXAMPLE.COM ', name: 'Admin' }],
      rejected: [{ address: 'other@example.com', name: 'Other' }],
    })

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .resolves
      .toMatchObject({ status: 'queued' })
  })

  it.each([
    ['empty delivery result', { accepted: [], rejected: [] }],
    ['target also rejected', { accepted: ['admin@example.com'], rejected: [' admin@EXAMPLE.COM '] }],
  ])('does not accept %s', async (_label, deliveryResult) => {
    mocks.sendMail.mockResolvedValue(deliveryResult)

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code: 'EMAIL_TEST_RECIPIENT_REJECTED', retryable: false })
  })

  it.each([
    {
      code: 'EMAIL_TEST_RECIPIENT_REJECTED',
      command: 'RCPT TO',
      responseCode: 550,
      retryable: false,
    },
    {
      code: 'EMAIL_TEST_RECIPIENT_REJECTED',
      command: 'RCPT TO',
      responseCode: 450,
      retryable: true,
    },
    {
      code: 'EMAIL_TEST_SENDER_REJECTED',
      command: 'MAIL FROM',
      responseCode: 553,
      retryable: false,
    },
    {
      code: 'EMAIL_TEST_DATA_COMMAND_REJECTED',
      command: 'DATA',
      responseCode: 554,
      retryable: false,
    },
  ])('classifies EENVELOPE $command/$responseCode as $code', async (expected) => {
    mocks.sendMail.mockRejectedValue(createSmtpFailure({
      code: 'EENVELOPE',
      command: expected.command,
      rejected: expected.command === 'RCPT TO' ? [{ address: ' admin@Example.com ' }] : [],
      responseCode: expected.responseCode,
    }))

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code: expected.code, retryable: expected.retryable })
  })

  it('distinguishes a message rejection after DATA from a DATA command rejection', async () => {
    mocks.sendMail.mockRejectedValue(createSmtpFailure({
      code: 'EMESSAGE',
      command: 'DATA',
      responseCode: 554,
    }))

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code: 'EMAIL_TEST_MESSAGE_REJECTED', retryable: false })
  })

  it('sanitizes unknown SMTP diagnostics before writing the audit result', async () => {
    mocks.sendMail.mockRejectedValue(createSmtpFailure({
      code: 'EENVELOPE',
      command: 'RCPT TO\r\nX-Secret: leaked',
      rejected: [{ address: 'admin@example.com' }],
      response: '550 password=private',
      responseCode: '550\r\nX-Secret: leaked',
    }))

    await expect(sendTestEmail('admin@example.com', 'admin-1')).rejects.toBeInstanceOf(EmailSettingsError)

    const auditCall = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes('\'email_settings.test_send\''))
    expect(auditCall?.[1]).toEqual(expect.arrayContaining(['unknown']))
    expect(auditCall?.[1]).not.toContain('admin@example.com')
    expect(JSON.stringify(auditCall)).not.toContain('password=private')
    expect(JSON.stringify(auditCall)).not.toContain('X-Secret')
  })

  it('detects a concurrent SMTP configuration save after the server accepted mail', async () => {
    mocks.transactionRow = { ...BASE_ROW, host: 'smtp.changed.example.com' }

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({
        code: 'EMAIL_SETTINGS_CHANGED_DURING_TEST',
        message: expect.stringContaining('可能已投递'),
      })
    expect(mocks.sessionQuery).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.any(Array),
    )
    expect(mocks.sessionRelease).toHaveBeenCalledOnce()
  })

  it('releases the single-flight lock when result auditing fails', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from control.email_settings'))
        return { rows: [mocks.settingsRow] }
      if (sql.includes('\'email_settings.test_send\''))
        throw new Error('audit unavailable')
      return { rows: [] }
    })

    await expect(sendTestEmail('admin@example.com', 'admin-1')).resolves.toMatchObject({ status: 'queued' })
    expect(mocks.sessionQuery).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.any(Array),
    )
    expect(mocks.sessionRelease).toHaveBeenCalledWith(false)
  })

  it('does not treat another diagnostic status update as a configuration change', async () => {
    mocks.transactionRow = {
      ...BASE_ROW,
      last_check_at: new Date('2026-09-11T08:20:00.000Z'),
      last_check_code: 'EMAIL_READY',
      last_check_ok: true,
      updated_at: new Date('2026-09-11T08:20:00.000Z'),
    }

    await expect(testSavedEmailSettings('admin-1')).resolves.toMatchObject({
      checkedAt: '2026-09-11T08:30:00.000Z',
      status: 'ready',
    })
  })

  it.each([
    ['EAUTH', 'EMAIL_SMTP_AUTH_FAILED', false],
    ['ETLS', 'EMAIL_SMTP_TLS_FAILED', false],
    ['ETIMEDOUT', 'EMAIL_SMTP_CONNECTION_FAILED', true],
    ['ECONNECTION', 'EMAIL_SMTP_CONNECTION_FAILED', true],
    ['ESOCKET', 'EMAIL_SMTP_CONNECTION_FAILED', true],
  ])('maps %s without exposing the SMTP error', async (transportCode, code, retryable) => {
    mocks.sendMail.mockRejectedValue(createSmtpFailure({ code: transportCode }))

    await expect(sendTestEmail('admin@example.com', 'admin-1'))
      .rejects
      .toMatchObject({ code, retryable })
    await expect(sendTestEmail('admin@example.com', 'admin-2'))
      .rejects
      .not
      .toThrow('upstream response contains private diagnostics')
    expect(mocks.sessionQuery).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.any(Array),
    )
  })
})

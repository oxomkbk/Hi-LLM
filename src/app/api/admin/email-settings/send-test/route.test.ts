import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmailSettingsError } from '@/lib/email/settings'

import { POST } from './route'

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireSystemAdminSession: vi.fn(async () => ({ user: { id: 'admin-1' } })),
  sendTestEmail: vi.fn(async (recipient: string) => ({
    deliveryConfirmed: false,
    messageId: '<trace@example.com>',
    queuedAt: '2026-09-11T08:30:00.000Z',
    recipient,
    source: 'database',
    status: 'queued',
  })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({
  requireSystemAdminSession: mocks.requireSystemAdminSession,
}))
vi.mock('@/lib/email/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/settings')>()
  return { ...actual, sendTestEmail: mocks.sendTestEmail }
})
vi.mock('@/lib/security', () => ({ assertSameOrigin: mocks.assertSameOrigin }))

function createRequest(body: BodyInit | null, contentType = 'application/json') {
  return new NextRequest('https://www.hillm.ai/api/admin/email-settings/send-test', {
    body,
    headers: contentType ? { 'content-type': contentType } : undefined,
    method: 'POST',
  })
}

describe('admin test email route', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends one normalized recipient through the saved transport', async () => {
    const response = await POST(createRequest(JSON.stringify({ recipient: ' Admin@Example.com ' })))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce()
    expect(mocks.requireSystemAdminSession).toHaveBeenCalledOnce()
    expect(mocks.sendTestEmail).toHaveBeenCalledWith('Admin@example.com', 'admin-1')
    expect(payload.msg).toBe('测试邮件已进入 SMTP 投递队列')
    expect(payload.data).toEqual({
      deliveryConfirmed: false,
      messageId: '<trace@example.com>',
      queuedAt: '2026-09-11T08:30:00.000Z',
      recipient: 'Admin@example.com',
      source: 'database',
      status: 'queued',
    })
    expect(JSON.stringify(payload)).not.toContain('smtpResponse')
  })

  it('rejects a non-JSON request with a stable 415 response', async () => {
    const response = await POST(createRequest('recipient=admin@example.com', 'application/x-www-form-urlencoded'))
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error.code).toBe('EMAIL_TEST_REQUEST_INVALID')
    expect(mocks.sendTestEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{'],
    ['non-object JSON', '[]'],
    ['missing recipient', '{}'],
    ['extra fields', JSON.stringify({ recipient: 'admin@example.com', subject: 'custom' })],
  ])('rejects %s with a stable 400 response', async (_label, body) => {
    const response = await POST(createRequest(body))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('EMAIL_TEST_REQUEST_INVALID')
    expect(mocks.sendTestEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid mailbox separately from request shape', async () => {
    const response = await POST(createRequest(JSON.stringify({ recipient: 'A <a@example.com>' })))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('EMAIL_RECIPIENT_INVALID')
  })

  it.each([
    ['permanent recipient rejection', 550, false],
    ['temporary recipient rejection', 450, true],
  ])('returns the explicit retry policy for %s', async (_label, smtpCode, retryable) => {
    mocks.sendTestEmail.mockRejectedValueOnce(new EmailSettingsError(
      `SMTP ${smtpCode}`,
      502,
      'EMAIL_TEST_RECIPIENT_REJECTED',
      retryable,
    ))

    const response = await POST(createRequest(JSON.stringify({ recipient: 'admin@example.com' })))
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.code).toBe(502)
    expect(payload.error).toEqual({
      code: 'EMAIL_TEST_RECIPIENT_REJECTED',
      retryable,
    })
  })

  it('reports only an overlapping send without imposing a cooldown', async () => {
    mocks.sendTestEmail.mockRejectedValueOnce(new EmailSettingsError(
      '已有一封测试邮件正在发送，请等待完成后再试',
      409,
      'EMAIL_TEST_ALREADY_RUNNING',
      true,
    ))

    const response = await POST(createRequest(JSON.stringify({ recipient: 'admin@example.com' })))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe(409)
    expect(payload.error.retryable).toBe(true)
  })
})

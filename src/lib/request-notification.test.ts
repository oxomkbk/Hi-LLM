import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError, notifyRequestFailure } from './request'

const mocks = vi.hoisted(() => ({ danger: vi.fn() }))

vi.mock('@heroui/react', () => ({ toast: { danger: mocks.danger } }))

describe('notifyRequestFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not duplicate a toast already shown by the request layer', () => {
    const error = new ApiRequestError('SMTP rejected', 502, 'EMAIL_TEST_SENDER_REJECTED', false, true)

    expect(() => notifyRequestFailure(error, 'fallback')).not.toThrow()
    expect(mocks.danger).not.toHaveBeenCalled()
  })

  it('shows one message for an API error that has not been notified', () => {
    const error = new ApiRequestError('网络暂时不可用', 502)

    notifyRequestFailure(error, 'fallback')

    expect(mocks.danger).toHaveBeenCalledOnce()
    expect(mocks.danger).toHaveBeenCalledWith('网络暂时不可用')
  })

  it('shows one safe fallback for a non-API error', () => {
    notifyRequestFailure(new TypeError('fetch failed with private URL'), '测试邮件发送失败，请稍后重试')

    expect(mocks.danger).toHaveBeenCalledOnce()
    expect(mocks.danger).toHaveBeenCalledWith('测试邮件发送失败，请稍后重试')
  })
})

import { describe, expect, it } from 'vitest'

import { isRetryableSecurityErrorCode } from './errors'

describe('security error retry policy', () => {
  it('retries only infrastructure and transient source failures', () => {
    expect(isRetryableSecurityErrorCode('SECURITY_ASSESSMENT_INPUT_CHANGED')).toBe(true)
    expect(isRetryableSecurityErrorCode('SECURITY_SOURCE_FETCH_FAILED')).toBe(true)
    expect(isRetryableSecurityErrorCode('SECURITY_SOURCE_TRANSIENT')).toBe(true)
    expect(isRetryableSecurityErrorCode('SECURITY_WORKER_TIMEOUT')).toBe(true)
    expect(isRetryableSecurityErrorCode('SECURITY_WORKER_SHUTDOWN')).toBe(true)
    expect(isRetryableSecurityErrorCode('SECURITY_SOURCE_INVALID')).toBe(false)
    expect(isRetryableSecurityErrorCode('SOURCE_LIMIT_EXCEEDED')).toBe(false)
    expect(isRetryableSecurityErrorCode('SECURITY_ASSESSMENT_CANCELLED')).toBe(false)
  })
})

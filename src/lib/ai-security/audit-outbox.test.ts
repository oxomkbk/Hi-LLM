import { describe, expect, it } from 'vitest'

import { sanitizeAuditMetadata } from './audit-outbox'

describe('security audit metadata', () => {
  it('keeps bounded operational identifiers', () => {
    expect(sanitizeAuditMetadata({
      assessmentId: 'assessment-1',
      mode: 'warn',
      result: { code: 'SECURITY_PUBLISH_BLOCKED', count: 2 },
    })).toEqual({
      assessmentId: 'assessment-1',
      mode: 'warn',
      result: { code: 'SECURITY_PUBLISH_BLOCKED', count: 2 },
    })
  })

  it('redacts secrets, evidence, content and command output recursively', () => {
    const metadata = sanitizeAuditMetadata({
      apiKey: 'secret',
      nested: { commandOutput: 'raw output', safeId: 'subject-1' },
      promptContent: 'untrusted body',
    })

    expect(metadata).toEqual({
      apiKey: '[REDACTED]',
      nested: { commandOutput: '[REDACTED]', safeId: 'subject-1' },
      promptContent: '[REDACTED]',
    })
  })
})

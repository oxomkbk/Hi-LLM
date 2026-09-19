import { describe, expect, it } from 'vitest'

import { redactSecurityText } from './redaction'

describe('security report redaction', () => {
  it('removes common credential forms without returning the secret', () => {
    const input = 'Authorization: Bearer abcdefghijklmnop and api_key=secret-value-123456789 and AKIAIOSFODNN7EXAMPLE'
    const output = redactSecurityText(input)

    expect(output).not.toContain('abcdefghijklmnop')
    expect(output).not.toContain('secret-value-123456789')
    expect(output).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(output).toContain('[REDACTED]')
  })
})

import { describe, expect, it } from 'vitest'

import { normalizeCoverage } from './coverage'

describe('assessment coverage', () => {
  it('requires partial coverage to enumerate skipped inputs and reasons', () => {
    expect(() => normalizeCoverage({
      included: ['SKILL.md'],
      level: 'partial',
      partitions: {},
      skipped: [],
    })).toThrow('SECURITY_COVERAGE_INVALID')
  })

  it('keeps config-only coverage explicit', () => {
    expect(normalizeCoverage({
      included: ['mcp.installations'],
      level: 'config_only',
      partitions: {
        configuration: { includedCount: 1, skippedCount: 0, status: 'complete' },
        source: { includedCount: 0, skippedCount: 1, status: 'config_only' },
      },
      skipped: [{ reason: 'source_not_provided', ref: 'source' }],
    })).toMatchObject({
      label: '仅配置评测',
      level: 'config_only',
    })
  })

  it('does not allow a complete report to hide skipped inputs', () => {
    expect(() => normalizeCoverage({
      included: ['README.md'],
      level: 'complete',
      partitions: {},
      skipped: [{ reason: 'unsupported', ref: 'script.exe' }],
    })).toThrow('SECURITY_COVERAGE_INVALID')
  })
})

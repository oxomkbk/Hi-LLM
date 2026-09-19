import { describe, expect, it } from 'vitest'

import { scoreFindings } from './scoring'

describe('deterministic security scoring', () => {
  it('applies deductions, severity caps, grade and verdict', () => {
    expect(scoreFindings([
      { fingerprint: 'a', severity: 'high' },
      { fingerprint: 'b', severity: 'low' },
    ])).toMatchObject({
      counts: { critical: 0, high: 1, info: 0, low: 1, medium: 0 },
      grade: 'C',
      highestSeverity: 'high',
      score: 69,
      verdict: 'blocked',
    })
  })

  it('deduplicates findings conservatively by fingerprint', () => {
    const result = scoreFindings([
      { fingerprint: 'same', severity: 'low' },
      { fingerprint: 'same', severity: 'critical' },
    ])

    expect(result.score).toBe(39)
    expect(result.counts.critical).toBe(1)
    expect(result.counts.low).toBe(0)
  })

  it('keeps advisory findings visible in the score without creating manual work', () => {
    const result = scoreFindings([
      { fingerprint: 'high', riskCode: 'PROMPT_INSTRUCTION_OVERRIDE', severity: 'high' },
      { fingerprint: 'medium', severity: 'medium' },
    ])

    expect(result.score).toBe(65)
    expect(result.grade).toBe('C')
    expect(result.verdict).toBe('passed')
  })

  it('blocks findings that can execute or damage the user environment', () => {
    const result = scoreFindings([
      { fingerprint: 'danger', riskCode: 'MCP_SHELL_INJECTION', severity: 'high' },
      { fingerprint: 'medium', severity: 'medium' },
    ])

    expect(result.verdict).toBe('blocked')
  })
})

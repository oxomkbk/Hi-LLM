import { describe, expect, it } from 'vitest'

import { securityRiskDisposition, strongestSecurityRiskDisposition } from './risk-disposition'

describe('security risk disposition', () => {
  it('keeps quality and prompt-writing findings advisory', () => {
    expect(securityRiskDisposition({ riskCode: 'MCP_UNPINNED_PACKAGE', severity: 'medium' })).toBe('advisory')
    expect(securityRiskDisposition({ riskCode: 'PROMPT_INSTRUCTION_OVERRIDE', severity: 'high' })).toBe('advisory')
  })

  it('blocks destructive risk while keeping declared utility scripts advisory', () => {
    expect(securityRiskDisposition({ riskCode: 'MCP_SHELL_INJECTION', severity: 'high' })).toBe('manual_review')
    expect(securityRiskDisposition({ riskCode: 'SKILL_EXECUTABLE_FILE', severity: 'medium' })).toBe('advisory')
    expect(securityRiskDisposition({ riskCode: 'SKILL_DYNAMIC_EXECUTION', severity: 'medium' })).toBe('advisory')
    expect(securityRiskDisposition({ riskCode: 'SKILL_DATA_EXFILTRATION', severity: 'critical' })).toBe('hard_block')
  })

  it('uses conservative defaults for future high and critical rules', () => {
    expect(securityRiskDisposition({ riskCode: 'FUTURE_HIGH_RULE', severity: 'high' })).toBe('manual_review')
    expect(securityRiskDisposition({ riskCode: 'FUTURE_CRITICAL_RULE', severity: 'critical' })).toBe('hard_block')
    expect(strongestSecurityRiskDisposition([
      { riskCode: 'MCP_SOURCE_NOT_PROVIDED', severity: 'medium' },
      { riskCode: 'FUTURE_HIGH_RULE', severity: 'high' },
    ])).toBe('manual_review')
  })
})

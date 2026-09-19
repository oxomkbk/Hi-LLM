import type { SecuritySeverity } from './domain'

export type SecurityRiskDisposition = 'advisory' | 'hard_block' | 'manual_review'

const ADVISORY_HIGH_RISK_CODES = new Set([
  'PROMPT_INSTRUCTION_OVERRIDE',
  'PROMPT_SECRET_REQUEST',
  'SKILL_INSTRUCTION_OVERRIDE',
])

const MANUAL_REVIEW_RISK_CODES = new Set([
  'MCP_DANGEROUS_COMMAND',
  'MCP_SHELL_INJECTION',
  'PROMPT_EXECUTABLE_ASSET',
  'PROMPT_OBFUSCATED_EXECUTION',
  'SKILL_OBFUSCATED_EXECUTION',
])

export function securityRiskDisposition(input: { riskCode?: string | null, severity: SecuritySeverity }): SecurityRiskDisposition {
  const riskCode = input.riskCode?.normalize('NFC').trim().toUpperCase() ?? ''

  if (input.severity === 'critical')
    return 'hard_block'
  if (MANUAL_REVIEW_RISK_CODES.has(riskCode))
    return 'manual_review'
  if (input.severity === 'high' && !ADVISORY_HIGH_RISK_CODES.has(riskCode))
    return 'manual_review'
  return 'advisory'
}

export function securityRiskRequiresAction(input: { riskCode?: string | null, severity: SecuritySeverity }) {
  return securityRiskDisposition(input) !== 'advisory'
}

export function strongestSecurityRiskDisposition(findings: readonly { riskCode?: string | null, severity: SecuritySeverity }[]) {
  let strongest: SecurityRiskDisposition = 'advisory'
  for (const finding of findings) {
    const disposition = securityRiskDisposition(finding)
    if (disposition === 'hard_block')
      return disposition
    if (disposition === 'manual_review')
      strongest = disposition
  }
  return strongest
}

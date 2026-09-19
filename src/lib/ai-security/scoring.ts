import { strongestSecurityRiskDisposition } from './risk-disposition'

import type { SecurityRiskCounts, SecurityScore, SecuritySeverity } from './domain'

const DEDUCTIONS: Record<SecuritySeverity, number> = {
  critical: 50,
  high: 25,
  info: 0,
  low: 3,
  medium: 10,
}

const SCORE_CAPS: Partial<Record<SecuritySeverity, number>> = {
  critical: 39,
  high: 69,
  medium: 84,
}

const SEVERITY_RANK: Record<SecuritySeverity, number> = {
  critical: 5,
  high: 4,
  info: 1,
  low: 2,
  medium: 3,
}

export interface ScorableFinding {
  fingerprint: string
  riskCode?: string
  severity: SecuritySeverity
}

export function scoreFindings(
  findings: readonly ScorableFinding[],
  falsePositiveFingerprints: ReadonlySet<string> = new Set(),
): SecurityScore {
  const deduplicated = new Map<string, { riskCode?: string, severity: SecuritySeverity }>()

  for (const finding of findings) {
    if (falsePositiveFingerprints.has(finding.fingerprint))
      continue
    const current = deduplicated.get(finding.fingerprint)
    if (!current || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity])
      deduplicated.set(finding.fingerprint, { riskCode: finding.riskCode, severity: finding.severity })
  }

  const counts: SecurityRiskCounts = { critical: 0, high: 0, info: 0, low: 0, medium: 0 }
  let deduction = 0
  let cap = 100
  let highestSeverity: SecuritySeverity | null = null

  for (const { severity } of deduplicated.values()) {
    counts[severity] += 1
    deduction += DEDUCTIONS[severity]
    cap = Math.min(cap, SCORE_CAPS[severity] ?? 100)
    if (!highestSeverity || SEVERITY_RANK[severity] > SEVERITY_RANK[highestSeverity])
      highestSeverity = severity
  }

  const score = Math.max(0, Math.min(100 - deduction, cap))
  const disposition = strongestSecurityRiskDisposition([...deduplicated.values()])
  return {
    counts,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
    highestSeverity,
    score,
    verdict: disposition === 'advisory' ? 'passed' : 'blocked',
  }
}

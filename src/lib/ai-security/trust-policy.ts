import type {
  SecurityCoverageLevel,
  SecuritySeverity,
  SecurityTrustDimension,
  SecurityTrustDimensionCode,
  SecurityTrustRating,
} from './domain'

const WEIGHTS: Record<SecurityTrustDimensionCode, number> = {
  applicability: 0.15,
  effectiveness: 0.15,
  maintainability: 0.15,
  reliability: 0.2,
  safety: 0.35,
}

export function calculateTrustScore(
  dimensions: readonly Pick<SecurityTrustDimension, 'code' | 'score'>[],
  findings: readonly { severity: SecuritySeverity }[],
) {
  const weighted = dimensions.reduce((total, dimension) => total + dimension.score * WEIGHTS[dimension.code], 0)
  const score = trustRoundScore(weighted)
  if (findings.some(finding => finding.severity === 'critical'))
    return Math.min(score, 1)
  if (findings.some(finding => finding.severity === 'high'))
    return Math.min(score, 2.5)
  if (findings.some(finding => finding.severity === 'medium'))
    return Math.min(score, 3.8)
  return score
}

export function trustRatingForScore(score: number): SecurityTrustRating {
  if (score >= 4.8)
    return 'exceptional'
  if (score >= 4.3)
    return 'excellent'
  if (score >= 3.6)
    return 'good'
  if (score >= 3)
    return 'fair'
  return 'poor'
}

export function trustRoundScore(value: number) {
  return Math.max(0, Math.min(5, Math.round(value * 10) / 10))
}

export function trustSafetyScore(
  findings: readonly { severity: SecuritySeverity }[],
  coverageLevel: SecurityCoverageLevel,
) {
  const severities = new Set(findings.map(finding => finding.severity))
  const highest = (['critical', 'high', 'medium', 'low', 'info'] as const).find(severity => severities.has(severity)) ?? null
  const base = ({ critical: 0.5, high: 2, info: 4.8, low: 4.4, medium: 3.4 } as const)[highest ?? 'info']
  const noFindingsScore = highest ? base : 5
  const coveragePenalty = coverageLevel === 'complete' ? 0 : coverageLevel === 'partial' ? 0.3 : 0.7
  return trustRoundScore(noFindingsScore - coveragePenalty)
}

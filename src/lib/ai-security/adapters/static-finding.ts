import { sha256Canonical } from '../canonical-json'

import type { SecuritySeverity } from '../domain'
import type { NormalizedSecurityFinding } from '../finalize'

export interface StaticFindingInput {
  artifactPath?: null | string
  description: string
  evidenceRedacted?: null | string
  publicSummary?: null | string
  recommendation: string
  riskCode: string
  severity: SecuritySeverity
  startLine?: null | number
  title: string
}

export function createStaticFinding(input: StaticFindingInput): NormalizedSecurityFinding {
  const normalized = {
    artifactPath: input.artifactPath ?? null,
    description: input.description.normalize('NFC').trim(),
    endLine: input.startLine ?? null,
    evidenceRedacted: input.evidenceRedacted?.normalize('NFC').trim() || null,
    publicSummary: input.publicSummary?.normalize('NFC').trim() || null,
    publicVisible: true,
    recommendation: input.recommendation.normalize('NFC').trim(),
    riskCode: input.riskCode.normalize('NFC').trim().toUpperCase(),
    severity: input.severity,
    startLine: input.startLine ?? null,
    title: input.title.normalize('NFC').trim(),
  }
  return {
    ...normalized,
    fingerprint: sha256Canonical({ ...normalized, schema: 'static-security-finding-v1' }),
  }
}

import { leaseMatches } from './queue-policy'

import type { SecuritySubjectType } from './domain'
import type { LeaseIdentity, LeaseSnapshot } from './queue-policy'

interface ReportPromotionInput {
  activeAssessmentId: string | null
  assessmentId: string
  currentDeclaredFingerprint: string
  currentScannerConfigFingerprint: string
  lease: {
    actual: LeaseSnapshot
    expected: LeaseIdentity
    now?: Date
  }
  taskDeclaredFingerprint: string
  taskScannerConfigFingerprint: string
}

export function freshUntilForSubject(subjectType: SecuritySubjectType, assessedAt: Date) {
  const days = subjectType === 'prompt' ? 90 : 30
  return new Date(assessedAt.getTime() + days * 24 * 60 * 60 * 1000)
}

export function reportPromotionEligibility(input: ReportPromotionInput): {
  eligible: boolean
  reason: 'config_changed' | 'content_changed' | 'current' | 'lease_lost' | 'superseded'
} {
  if (!leaseMatches(input.lease))
    return { eligible: false, reason: 'lease_lost' }
  if (input.activeAssessmentId !== input.assessmentId)
    return { eligible: false, reason: 'superseded' }
  if (input.currentDeclaredFingerprint !== input.taskDeclaredFingerprint)
    return { eligible: false, reason: 'content_changed' }
  if (input.currentScannerConfigFingerprint !== input.taskScannerConfigFingerprint)
    return { eligible: false, reason: 'config_changed' }
  return { eligible: true, reason: 'current' }
}

export function terminalReportDisposition(input: {
  hasLatestAssessment: boolean
  oldReportCurrent: boolean
  terminalStatus: 'cancelled' | 'failed'
}) {
  if (input.oldReportCurrent)
    return 'preserve' as const
  if (input.hasLatestAssessment)
    return 'stale' as const
  return input.terminalStatus === 'failed' ? 'failed' as const : 'unassessed' as const
}

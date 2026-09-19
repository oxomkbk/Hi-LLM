import type {
  SecurityActiveScanStatus,
  SecurityAssessmentStatus,
  SecurityEffectiveReportState,
  SecurityGrade,
  SecurityMode,
  SecurityOverrideKind,
  SecurityReportState,
  SecurityVerdict,
} from './domain'
import type { SecurityRiskDisposition } from './risk-disposition'

const ALLOWED_TRANSITIONS: Readonly<Record<SecurityAssessmentStatus, readonly SecurityAssessmentStatus[]>> = {
  cancelled: [],
  completed: [],
  failed: [],
  preparing: ['running', 'failed', 'cancelled'],
  queued: ['preparing', 'failed', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
}

export interface DerivedSubjectReport {
  grade: SecurityGrade | null
  reportState: SecurityReportState
  scanStatus: SecurityActiveScanStatus | null
  score: number | null
  verdict: SecurityVerdict | null
}

export interface DeriveSubjectReportInput {
  activeScanStatus: SecurityActiveScanStatus | null
  currentDeclaredFingerprint: string
  currentScannerConfigFingerprint: string
  latestAttemptStatus: SecurityAssessmentStatus | null
  now?: Date
  report: EffectiveReportSnapshot | null
}

export interface EffectiveReportSnapshot {
  assessedDeclaredFingerprint: string
  bindingMatches: boolean
  freshUntil: Date | null
  grade: SecurityGrade
  reportState: SecurityEffectiveReportState
  scannerConfigFingerprint: string
  score: number
  sourceRevisionChanged?: boolean
  verdict: SecurityVerdict
}

export interface PublishGateDecision {
  allowed: boolean
  reason: PublishGateReason
}

export interface PublishGateInput {
  hasTemporaryHigh: boolean
  mode: SecurityMode
  reportState: SecurityReportState
  riskDisposition: SecurityRiskDisposition | null
}

export type PublishGateReason
  = | 'mode_not_enforced'
    | 'report_passed'
    | 'critical_risk'
    | 'valid_report_required'
    | 'danger_review_required'

export interface SecurityOverrideContext {
  assessmentId: string
  currentDeclaredFingerprint: string
  currentInputFingerprint: string | null
  currentScannerConfigFingerprint: string
  latestAttemptId: string | null
  mode: SecurityMode
  now?: Date
}

export interface SecurityOverrideSnapshot {
  assessmentId: string
  basisAttemptId: string
  declaredFingerprint: string
  expiresAt: Date | null
  inputFingerprint: string | null
  kind: SecurityOverrideKind
  revokedAt: Date | null
  scannerConfigFingerprint: string
}

export function canTransitionAssessment(from: SecurityAssessmentStatus, to: SecurityAssessmentStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function deriveSubjectReport(input: DeriveSubjectReportInput): DerivedSubjectReport {
  const scanStatus = input.activeScanStatus
  const report = input.report

  if (!report) {
    return {
      grade: null,
      reportState: input.latestAttemptStatus === 'failed' ? 'failed' : 'unassessed',
      scanStatus,
      score: null,
      verdict: null,
    }
  }

  if (!isReportCurrent(input, report)) {
    return {
      grade: null,
      reportState: 'stale',
      scanStatus,
      score: null,
      verdict: null,
    }
  }

  return {
    grade: report.grade,
    reportState: report.reportState,
    scanStatus,
    score: report.score,
    verdict: report.verdict,
  }
}

export function evaluatePublishGate(input: PublishGateInput): PublishGateDecision {
  if (input.mode === 'off' || input.mode === 'observe' || input.mode === 'warn')
    return { allowed: true, reason: 'mode_not_enforced' }

  if (input.riskDisposition === 'hard_block')
    return { allowed: false, reason: 'critical_risk' }

  if (input.riskDisposition === 'manual_review') {
    return input.hasTemporaryHigh
      ? { allowed: true, reason: 'report_passed' }
      : { allowed: false, reason: 'danger_review_required' }
  }

  return input.reportState === 'failed' || input.reportState === 'stale' || input.reportState === 'unassessed'
    ? { allowed: false, reason: 'valid_report_required' }
    : { allowed: true, reason: 'report_passed' }
}

export function isOverrideEffective(input: {
  context: SecurityOverrideContext
  override: SecurityOverrideSnapshot
}) {
  const { context, override } = input
  const now = context.now ?? new Date()

  if (override.revokedAt || (override.expiresAt && override.expiresAt <= now))
    return false
  if (override.assessmentId !== context.assessmentId)
    return false
  if (override.declaredFingerprint !== context.currentDeclaredFingerprint)
    return false
  if (override.scannerConfigFingerprint !== context.currentScannerConfigFingerprint)
    return false
  if (override.inputFingerprint !== null && override.inputFingerprint !== context.currentInputFingerprint)
    return false

  if (override.kind === 'warn_acknowledgement') {
    return context.mode === 'warn'
      && override.basisAttemptId === context.latestAttemptId
  }

  if (context.mode !== 'enforce')
    return false

  return override.kind === 'accept_medium' || override.kind === 'temporary_high'
}

export function modeAllowsScanning(mode: SecurityMode) {
  return mode !== 'off'
}

function isReportCurrent(input: DeriveSubjectReportInput, report: EffectiveReportSnapshot) {
  const now = input.now ?? new Date()
  return report.bindingMatches
    && !report.sourceRevisionChanged
    && report.assessedDeclaredFingerprint === input.currentDeclaredFingerprint
    && report.scannerConfigFingerprint === input.currentScannerConfigFingerprint
    && (!report.freshUntil || report.freshUntil > now)
}

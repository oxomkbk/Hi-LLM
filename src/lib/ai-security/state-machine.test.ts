import { describe, expect, it } from 'vitest'

import {
  canTransitionAssessment,
  deriveSubjectReport,
  evaluatePublishGate,
  isOverrideEffective,
} from './state-machine'

const CURRENT_FINGERPRINT = 'a'.repeat(64)
const CONFIG_FINGERPRINT = 'b'.repeat(64)

describe('security assessment state machine', () => {
  it('allows only forward task transitions and terminal outcomes', () => {
    expect(canTransitionAssessment('queued', 'preparing')).toBe(true)
    expect(canTransitionAssessment('preparing', 'running')).toBe(true)
    expect(canTransitionAssessment('running', 'completed')).toBe(true)
    expect(canTransitionAssessment('running', 'failed')).toBe(true)
    expect(canTransitionAssessment('completed', 'running')).toBe(false)
    expect(canTransitionAssessment('failed', 'queued')).toBe(false)
  })

  it('keeps a valid previous report visible while a rescan is running', () => {
    const result = deriveSubjectReport({
      activeScanStatus: 'running',
      currentDeclaredFingerprint: CURRENT_FINGERPRINT,
      currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
      latestAttemptStatus: 'running',
      report: validReport(),
    })

    expect(result.reportState).toBe('passed')
    expect(result.scanStatus).toBe('running')
    expect(result.score).toBe(96)
  })

  it('shows unassessed plus running when no previous report exists', () => {
    const result = deriveSubjectReport({
      activeScanStatus: 'preparing',
      currentDeclaredFingerprint: CURRENT_FINGERPRINT,
      currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
      latestAttemptStatus: 'preparing',
      report: null,
    })

    expect(result.reportState).toBe('unassessed')
    expect(result.scanStatus).toBe('preparing')
    expect(result.score).toBeNull()
  })

  it('keeps a valid previous report when the latest rescan failed', () => {
    const result = deriveSubjectReport({
      activeScanStatus: null,
      currentDeclaredFingerprint: CURRENT_FINGERPRINT,
      currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
      latestAttemptStatus: 'failed',
      report: validReport(),
    })

    expect(result.reportState).toBe('passed')
    expect(result.scanStatus).toBeNull()
    expect(result.score).toBe(96)
  })

  it('invalidates scores when content, config or freshness no longer matches', () => {
    const contentChanged = deriveSubjectReport({
      activeScanStatus: null,
      currentDeclaredFingerprint: 'c'.repeat(64),
      currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
      latestAttemptStatus: 'completed',
      report: validReport(),
    })
    const configChanged = deriveSubjectReport({
      activeScanStatus: null,
      currentDeclaredFingerprint: CURRENT_FINGERPRINT,
      currentScannerConfigFingerprint: 'c'.repeat(64),
      latestAttemptStatus: 'completed',
      report: validReport(),
    })
    const expired = deriveSubjectReport({
      activeScanStatus: null,
      currentDeclaredFingerprint: CURRENT_FINGERPRINT,
      currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
      latestAttemptStatus: 'completed',
      now: new Date('2026-09-01T00:00:00.000Z'),
      report: validReport({ freshUntil: new Date('2026-08-31T00:00:00.000Z') }),
    })

    for (const result of [contentChanged, configChanged, expired]) {
      expect(result.reportState).toBe('stale')
      expect(result.score).toBeNull()
    }
  })
})

describe('security publishing decisions', () => {
  it('never permits a critical finding through an override', () => {
    expect(evaluatePublishGate({
      hasTemporaryHigh: true,
      mode: 'enforce',
      reportState: 'blocked',
      riskDisposition: 'hard_block',
    })).toEqual({ allowed: false, reason: 'critical_risk' })
  })

  it('never blocks advisory findings or warn-mode publishing', () => {
    expect(evaluatePublishGate({
      hasTemporaryHigh: false,
      mode: 'enforce',
      reportState: 'review_required',
      riskDisposition: 'advisory',
    })).toEqual({ allowed: true, reason: 'report_passed' })
    expect(evaluatePublishGate({
      hasTemporaryHigh: false,
      mode: 'warn',
      reportState: 'blocked',
      riskDisposition: 'manual_review',
    })).toEqual({ allowed: true, reason: 'mode_not_enforced' })
  })

  it('requires action only for findings that can execute or damage the user environment', () => {
    expect(evaluatePublishGate({
      hasTemporaryHigh: true,
      mode: 'enforce',
      reportState: 'blocked',
      riskDisposition: 'manual_review',
    }).allowed).toBe(true)
    expect(evaluatePublishGate({
      hasTemporaryHigh: false,
      mode: 'enforce',
      reportState: 'blocked',
      riskDisposition: 'manual_review',
    })).toEqual({ allowed: false, reason: 'danger_review_required' })
  })

  it('expires and invalidates subject-specific overrides deterministically', () => {
    expect(isOverrideEffective({
      context: {
        assessmentId: 'assessment-1',
        currentDeclaredFingerprint: CURRENT_FINGERPRINT,
        currentInputFingerprint: 'c'.repeat(64),
        currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
        latestAttemptId: 'assessment-1',
        mode: 'warn',
        now: new Date('2026-08-21T12:00:00.000Z'),
      },
      override: {
        assessmentId: 'assessment-1',
        basisAttemptId: 'assessment-1',
        declaredFingerprint: CURRENT_FINGERPRINT,
        expiresAt: new Date('2026-08-22T00:00:00.000Z'),
        inputFingerprint: 'c'.repeat(64),
        kind: 'warn_acknowledgement',
        revokedAt: null,
        scannerConfigFingerprint: CONFIG_FINGERPRINT,
      },
    })).toBe(true)

    expect(isOverrideEffective({
      context: {
        assessmentId: 'assessment-1',
        currentDeclaredFingerprint: CURRENT_FINGERPRINT,
        currentInputFingerprint: 'c'.repeat(64),
        currentScannerConfigFingerprint: CONFIG_FINGERPRINT,
        latestAttemptId: 'assessment-1',
        mode: 'enforce',
        now: new Date('2026-08-21T12:00:00.000Z'),
      },
      override: {
        assessmentId: 'assessment-1',
        basisAttemptId: 'assessment-1',
        declaredFingerprint: CURRENT_FINGERPRINT,
        expiresAt: null,
        inputFingerprint: 'c'.repeat(64),
        kind: 'warn_acknowledgement',
        revokedAt: null,
        scannerConfigFingerprint: CONFIG_FINGERPRINT,
      },
    })).toBe(false)
  })
})

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    assessedDeclaredFingerprint: CURRENT_FINGERPRINT,
    bindingMatches: true,
    freshUntil: new Date('2026-09-30T00:00:00.000Z'),
    grade: 'A' as const,
    reportState: 'passed' as const,
    scannerConfigFingerprint: CONFIG_FINGERPRINT,
    score: 96,
    verdict: 'passed' as const,
    ...overrides,
  }
}

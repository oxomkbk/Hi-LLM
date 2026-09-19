import { sha256Canonical } from './canonical-json'

import type {
  SecurityEffectiveReportState,
  SecurityExecutionProfile,
  SecuritySubjectType,
  SecurityTrigger,
} from './domain'

export type AssessmentClaimScope
  = | { executionProfile: 'configured' }
    | { batchIds: readonly string[], executionProfile: 'local_deterministic' }

export interface AssessmentIdempotencyInput {
  batchId: string | null
  declaredFingerprint: string
  executionProfile: SecurityExecutionProfile
  requestId?: string | null
  scannerConfigFingerprint: string
  subjectId: string
  subjectType: SecuritySubjectType
  trigger: SecurityTrigger
}

export interface LeaseIdentity {
  leaseToken: string
  leaseVersion: number
  workerId: string
}

export interface LeaseSnapshot extends LeaseIdentity {
  leaseExpiresAt: Date | null
}

export interface NormalizedAssessmentClaimScope {
  batchIds: string[] | null
  executionProfile: SecurityExecutionProfile
}

export interface ReusableAssessmentInput {
  assessedDeclaredFingerprint: string | null
  bindingMatches: boolean
  currentDeclaredFingerprint: string
  currentScannerConfigFingerprint: string
  freshUntil: Date | null
  now?: Date
  reportState: SecurityEffectiveReportState | 'failed' | 'stale' | 'unassessed'
  scannerConfigFingerprint: string | null
}

export function assessmentIdempotencyKey(input: AssessmentIdempotencyInput) {
  const hash = sha256Canonical({
    batchId: input.batchId,
    declaredFingerprint: input.declaredFingerprint,
    executionProfile: input.executionProfile,
    requestId: input.requestId ?? null,
    scannerConfigFingerprint: input.scannerConfigFingerprint,
    schema: 'assessment-idempotency-v2',
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    trigger: input.trigger,
  })
  return `assessment:v1:${hash}`
}

export function isReusableAssessment(input: ReusableAssessmentInput) {
  const now = input.now ?? new Date()
  return input.bindingMatches
    && ['passed', 'review_required', 'blocked'].includes(input.reportState)
    && input.assessedDeclaredFingerprint === input.currentDeclaredFingerprint
    && input.scannerConfigFingerprint === input.currentScannerConfigFingerprint
    && (!input.freshUntil || input.freshUntil > now)
}

export function leaseMatches(input: {
  actual: LeaseSnapshot
  expected: LeaseIdentity
  now?: Date
}) {
  const now = input.now ?? new Date()
  return input.actual.workerId === input.expected.workerId
    && input.actual.leaseToken === input.expected.leaseToken
    && input.actual.leaseVersion === input.expected.leaseVersion
    && Boolean(input.actual.leaseExpiresAt && input.actual.leaseExpiresAt > now)
}

export function nextRetryAttempt(currentAttempt: number, maximumAttempts: number) {
  if (!Number.isSafeInteger(currentAttempt) || !Number.isSafeInteger(maximumAttempts))
    return null
  if (currentAttempt < 1 || maximumAttempts < 1 || currentAttempt >= maximumAttempts)
    return null
  return currentAttempt + 1
}

export function normalizeClaimLimit(value: number) {
  if (!Number.isFinite(value))
    return 1
  return Math.max(1, Math.min(100, Math.trunc(value)))
}

export function normalizeClaimScope(scope: AssessmentClaimScope): NormalizedAssessmentClaimScope {
  if (scope.executionProfile === 'configured') {
    return {
      batchIds: null,
      executionProfile: 'configured',
    }
  }
  const batchIds = [...new Set(scope.batchIds.map(value => value.normalize('NFC').trim()))]
    .sort()
  if (batchIds.length === 0 || batchIds.some(value => !isUuid(value)))
    throw new TypeError('Invalid local deterministic batch scope')
  return {
    batchIds,
    executionProfile: 'local_deterministic',
  }
}

export function remainingGlobalWorkerCapacity(configuredConcurrency: number, inFlight: number) {
  if (!Number.isSafeInteger(configuredConcurrency) || configuredConcurrency < 1)
    return 0
  if (!Number.isSafeInteger(inFlight) || inFlight < 0)
    return 0
  return Math.max(0, configuredConcurrency - inFlight)
}

export function usesLlmBudget(profile: SecurityExecutionProfile) {
  return profile === 'configured'
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

import { describe, expect, it } from 'vitest'

import {
  assessmentIdempotencyKey,
  isReusableAssessment,
  leaseMatches,
  nextRetryAttempt,
  normalizeClaimLimit,
  normalizeClaimScope,
  remainingGlobalWorkerCapacity,
  usesLlmBudget,
} from './queue-policy'

const DECLARED = 'a'.repeat(64)
const CONFIG = 'b'.repeat(64)

describe('security queue policy', () => {
  it('builds stable content/config idempotency keys', () => {
    const first = assessmentIdempotencyKey({
      batchId: null,
      declaredFingerprint: DECLARED,
      executionProfile: 'configured',
      scannerConfigFingerprint: CONFIG,
      subjectId: 'subject-1',
      subjectType: 'skill',
      trigger: 'manual',
    })
    const second = assessmentIdempotencyKey({
      batchId: null,
      declaredFingerprint: DECLARED,
      executionProfile: 'configured',
      scannerConfigFingerprint: CONFIG,
      subjectId: 'subject-1',
      subjectType: 'skill',
      trigger: 'manual',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^assessment:v1:[0-9a-f]{64}$/)
  })

  it('isolates idempotency by persisted execution profile and batch', () => {
    const common = {
      declaredFingerprint: DECLARED,
      scannerConfigFingerprint: CONFIG,
      subjectId: 'subject-1',
      subjectType: 'skill' as const,
      trigger: 'batch' as const,
    }
    const configured = assessmentIdempotencyKey({
      ...common,
      batchId: null,
      executionProfile: 'configured',
    })
    const localA = assessmentIdempotencyKey({
      ...common,
      batchId: '11111111-1111-4111-8111-111111111111',
      executionProfile: 'local_deterministic',
    })
    const localB = assessmentIdempotencyKey({
      ...common,
      batchId: '22222222-2222-4222-8222-222222222222',
      executionProfile: 'local_deterministic',
    })

    expect(new Set([configured, localA, localB])).toHaveLength(3)
  })

  it('reuses only a current, fresh, bound report', () => {
    expect(isReusableAssessment({
      assessedDeclaredFingerprint: DECLARED,
      bindingMatches: true,
      currentDeclaredFingerprint: DECLARED,
      currentScannerConfigFingerprint: CONFIG,
      freshUntil: new Date('2026-09-01T00:00:00.000Z'),
      now: new Date('2026-08-21T00:00:00.000Z'),
      reportState: 'passed',
      scannerConfigFingerprint: CONFIG,
    })).toBe(true)

    expect(isReusableAssessment({
      assessedDeclaredFingerprint: DECLARED,
      bindingMatches: false,
      currentDeclaredFingerprint: DECLARED,
      currentScannerConfigFingerprint: CONFIG,
      freshUntil: null,
      now: new Date('2026-08-21T00:00:00.000Z'),
      reportState: 'passed',
      scannerConfigFingerprint: CONFIG,
    })).toBe(false)
  })

  it('keeps retries on one bounded root chain', () => {
    expect(nextRetryAttempt(1, 2)).toBe(2)
    expect(nextRetryAttempt(2, 2)).toBeNull()
    expect(nextRetryAttempt(1, 5)).toBe(2)
  })

  it('allows bounded batches of at most one hundred jobs', () => {
    expect(normalizeClaimLimit(0)).toBe(1)
    expect(normalizeClaimLimit(42)).toBe(42)
    expect(normalizeClaimLimit(101)).toBe(100)
  })

  it('enforces one global worker capacity across multiple processes', () => {
    expect(remainingGlobalWorkerCapacity(1, 0)).toBe(1)
    expect(remainingGlobalWorkerCapacity(1, 1)).toBe(0)
    expect(remainingGlobalWorkerCapacity(4, 2)).toBe(2)
    expect(remainingGlobalWorkerCapacity(0, 0)).toBe(0)
  })

  it('normalizes configured and local claim scopes without widening them', () => {
    expect(normalizeClaimScope({ executionProfile: 'configured' })).toEqual({
      batchIds: null,
      executionProfile: 'configured',
    })
    expect(normalizeClaimScope({
      batchIds: [
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ],
      executionProfile: 'local_deterministic',
    })).toEqual({
      batchIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
      executionProfile: 'local_deterministic',
    })
    expect(() => normalizeClaimScope({
      batchIds: [],
      executionProfile: 'local_deterministic',
    })).toThrow('batch')
  })

  it('charges only configured work against the LLM budget', () => {
    expect(usesLlmBudget('configured')).toBe(true)
    expect(usesLlmBudget('local_deterministic')).toBe(false)
  })

  it('requires worker, token, version and a live lease for fencing', () => {
    expect(leaseMatches({
      actual: {
        leaseExpiresAt: new Date('2026-08-21T00:01:00.000Z'),
        leaseToken: 'token-1',
        leaseVersion: 2,
        workerId: 'worker-1',
      },
      expected: { leaseToken: 'token-1', leaseVersion: 2, workerId: 'worker-1' },
      now: new Date('2026-08-21T00:00:00.000Z'),
    })).toBe(true)

    expect(leaseMatches({
      actual: {
        leaseExpiresAt: new Date('2026-08-20T23:59:00.000Z'),
        leaseToken: 'token-1',
        leaseVersion: 2,
        workerId: 'worker-1',
      },
      expected: { leaseToken: 'token-1', leaseVersion: 2, workerId: 'worker-1' },
      now: new Date('2026-08-21T00:00:00.000Z'),
    })).toBe(false)
  })
})

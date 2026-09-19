import { describe, expect, it, vi } from 'vitest'

import { normalizeTrustEvaluation } from './finalize'
import {
  freshUntilForSubject,
  reportPromotionEligibility,
  terminalReportDisposition,
} from './finalize-policy'

import type { SecurityDocumentEvaluation, SecurityHybridEvaluation } from './domain'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/business', () => ({ withBusinessTransaction: vi.fn() }))
vi.mock('./audit-outbox', () => ({ enqueueSecurityAudit: vi.fn() }))
vi.mock('./subject-repository', () => ({
  loadSecuritySubjectSnapshot: vi.fn(),
  lockSecuritySubjectRow: vi.fn(),
}))

const DECLARED = 'a'.repeat(64)
const CONFIG = 'b'.repeat(64)

describe('security assessment finalization policy', () => {
  it('promotes only the active task with matching content, config and lease', () => {
    expect(reportPromotionEligibility({
      activeAssessmentId: 'assessment-1',
      assessmentId: 'assessment-1',
      currentDeclaredFingerprint: DECLARED,
      currentScannerConfigFingerprint: CONFIG,
      lease: {
        actual: {
          leaseExpiresAt: new Date('2026-08-21T00:01:00.000Z'),
          leaseToken: 'token-1',
          leaseVersion: 1,
          workerId: 'worker-1',
        },
        expected: { leaseToken: 'token-1', leaseVersion: 1, workerId: 'worker-1' },
        now: new Date('2026-08-21T00:00:00.000Z'),
      },
      taskDeclaredFingerprint: DECLARED,
      taskScannerConfigFingerprint: CONFIG,
    })).toEqual({ eligible: true, reason: 'current' })

    expect(reportPromotionEligibility({
      activeAssessmentId: 'assessment-2',
      assessmentId: 'assessment-1',
      currentDeclaredFingerprint: DECLARED,
      currentScannerConfigFingerprint: CONFIG,
      lease: {
        actual: {
          leaseExpiresAt: new Date('2026-08-21T00:01:00.000Z'),
          leaseToken: 'token-1',
          leaseVersion: 1,
          workerId: 'worker-1',
        },
        expected: { leaseToken: 'token-1', leaseVersion: 1, workerId: 'worker-1' },
        now: new Date('2026-08-21T00:00:00.000Z'),
      },
      taskDeclaredFingerprint: DECLARED,
      taskScannerConfigFingerprint: CONFIG,
    })).toEqual({ eligible: false, reason: 'superseded' })
  })

  it('preserves a valid old report when a rescan fails', () => {
    expect(terminalReportDisposition({
      hasLatestAssessment: true,
      oldReportCurrent: true,
      terminalStatus: 'failed',
    })).toBe('preserve')
    expect(terminalReportDisposition({
      hasLatestAssessment: false,
      oldReportCurrent: false,
      terminalStatus: 'failed',
    })).toBe('failed')
    expect(terminalReportDisposition({
      hasLatestAssessment: true,
      oldReportCurrent: false,
      terminalStatus: 'cancelled',
    })).toBe('stale')
  })

  it('uses different freshness windows for remote source and Prompt reports', () => {
    const assessedAt = new Date('2026-08-21T00:00:00.000Z')
    expect(freshUntilForSubject('skill', assessedAt).toISOString()).toBe('2026-09-20T00:00:00.000Z')
    expect(freshUntilForSubject('prompt', assessedAt).toISOString()).toBe('2026-11-19T00:00:00.000Z')
  })
})

const hybridEvaluation: SecurityHybridEvaluation = {
  dimensions: ['safety', 'reliability', 'applicability', 'maintainability', 'effectiveness'].map(code => ({
    code: code as SecurityHybridEvaluation['dimensions'][number]['code'],
    evidence: ['可定位证据'],
    recommendations: ['保持更新'],
    score: code === 'safety' ? 4.7 : 4,
    source: code === 'safety' ? 'deterministic' : 'ai_assisted',
    strengths: ['结构清晰'],
    summary: '该维度具有可核验材料。',
    weaknesses: [],
  })),
  method: 'hybrid',
  model: 'quality-model',
  rating: 'good',
  schemaVersion: 'trusted-eval-v1',
  score: 4.2,
  summary: '综合评级良好。',
}

const documentEvaluation: SecurityDocumentEvaluation = {
  dimensions: ['safety', 'reliability', 'applicability', 'maintainability', 'effectiveness'].map(code => ({
    code: code as SecurityDocumentEvaluation['dimensions'][number]['code'],
    evidence: ['README.md · 可定位证据'],
    recommendations: ['补充边界说明'],
    score: code === 'safety' ? 4.7 : 3,
    source: 'deterministic',
    strengths: ['具有当前材料'],
    summary: '该维度依据当前材料生成。',
    weaknesses: ['未执行运行时验证'],
  })),
  method: 'document_evidence',
  model: 'platform-document-rubric-v1',
  rating: 'good',
  schemaVersion: 'document-evidence-v1',
  score: 3.6,
  summary: '当前资源：基于固定材料生成参考结论。',
}

describe('security trust evaluation normalization', () => {
  it('accepts an evidence-only deterministic report without quality dimensions', () => {
    expect(normalizeTrustEvaluation({
      dimensions: [],
      method: 'deterministic',
      model: 'platform-static-rules-v2',
      rating: null,
      schemaVersion: 'security-evidence-v1',
      score: null,
      summary: null,
    })).toEqual({
      dimensions: [],
      method: 'deterministic',
      model: 'platform-static-rules-v2',
      rating: null,
      schemaVersion: 'security-evidence-v1',
      score: null,
      summary: null,
    })
  })

  it('rejects deterministic reports that carry synthetic quality data', () => {
    expect(() => normalizeTrustEvaluation({
      ...hybridEvaluation,
      method: 'deterministic',
    } as never)).toThrow('静态证据报告结构无效')
  })

  it('accepts a complete hybrid quality report', () => {
    expect(normalizeTrustEvaluation(hybridEvaluation, [], 'partial')).toMatchObject({
      dimensions: expect.arrayContaining([expect.objectContaining({ code: 'safety' })]),
      method: 'hybrid',
      schemaVersion: 'trusted-eval-v1',
      score: 4.2,
    })
  })

  it('accepts a complete local document-evidence report', () => {
    expect(normalizeTrustEvaluation(documentEvaluation, [], 'partial')).toMatchObject({
      dimensions: expect.arrayContaining([
        expect.objectContaining({ code: 'safety', source: 'deterministic' }),
        expect.objectContaining({ code: 'effectiveness', source: 'deterministic' }),
      ]),
      method: 'document_evidence',
      model: 'platform-document-rubric-v1',
      rating: 'good',
      schemaVersion: 'document-evidence-v1',
      score: 3.6,
    })
  })

  it('rejects AI-sourced dimensions in a local document-evidence report', () => {
    expect(() => normalizeTrustEvaluation({
      ...documentEvaluation,
      dimensions: documentEvaluation.dimensions.map((dimension, index) => ({
        ...dimension,
        source: index === 1 ? 'ai_assisted' as const : dimension.source,
      })),
    }, [], 'partial')).toThrow('可信评测维度来源无效')
  })

  it('rejects hybrid reports with a missing quality dimension', () => {
    expect(() => normalizeTrustEvaluation({
      ...hybridEvaluation,
      dimensions: hybridEvaluation.dimensions.slice(0, 4),
    }, [], 'partial')).toThrow('可信评测报告结构无效')
  })

  it('rejects an evidence report with a non-platform model identity', () => {
    expect(() => normalizeTrustEvaluation({
      dimensions: [],
      method: 'deterministic',
      model: 'arbitrary-model',
      rating: null,
      schemaVersion: 'security-evidence-v1',
      score: null,
      summary: null,
    })).toThrow('静态证据报告结构无效')
  })

  it('rejects hybrid dimensions that were not produced by their required source', () => {
    expect(() => normalizeTrustEvaluation({
      ...hybridEvaluation,
      dimensions: hybridEvaluation.dimensions.map(dimension => ({
        ...dimension,
        source: 'deterministic' as const,
      })),
    }, [], 'partial')).toThrow('可信评测维度来源无效')
  })

  it('rejects a hybrid total that does not match dimensions and safety caps', () => {
    expect(() => normalizeTrustEvaluation({
      ...hybridEvaluation,
      score: 5,
    }, [], 'partial')).toThrow('可信评测总分无效')
  })

  it('maps malformed dimension values to a stable report validation error', () => {
    expect(() => normalizeTrustEvaluation({
      ...hybridEvaluation,
      dimensions: [null, ...hybridEvaluation.dimensions.slice(1)],
    } as never, [], 'partial')).toThrow('可信评测维度无效')
  })
})

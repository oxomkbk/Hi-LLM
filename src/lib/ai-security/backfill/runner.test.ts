import { describe, expect, it, vi } from 'vitest'

import {
  assertBatchEnqueueResults,
  assertLocalBackfillReadiness,
  exitCodeForBackfill,
  parseBackfillArgs,
  produceWithBackpressure,
  summarizeBatchTerminalRows,
} from './runner'

describe('security backfill runner policy', () => {
  it('defaults to a no-write full dry-run and parses the minimal apply options', () => {
    expect(parseBackfillArgs([])).toEqual({
      apply: false,
      limit: undefined,
      types: ['skill', 'mcp', 'prompt'],
    })
    expect(parseBackfillArgs(['--dry-run'])).toEqual({
      apply: false,
      limit: undefined,
      types: ['skill', 'mcp', 'prompt'],
    })
    expect(parseBackfillArgs(['--apply', '--limit=12', '--types=prompt,skill'])).toEqual({
      apply: true,
      limit: 12,
      types: ['skill', 'prompt'],
    })
    expect(() => parseBackfillArgs(['--force'])).toThrow('Unknown')
    expect(() => parseBackfillArgs(['--limit=0'])).toThrow('limit')
  })

  it('uses stable exit codes for success, terminal failures and infrastructure failures', () => {
    expect(exitCodeForBackfill({ failedSubjects: 0, infrastructureFailed: false, interrupted: false })).toBe(0)
    expect(exitCodeForBackfill({ failedSubjects: 2, infrastructureFailed: false, interrupted: false })).toBe(2)
    expect(exitCodeForBackfill({ failedSubjects: 0, infrastructureFailed: true, interrupted: false })).toBe(1)
    expect(exitCodeForBackfill({ failedSubjects: 0, infrastructureFailed: false, interrupted: true })).toBe(130)
  })

  it('keeps producing after queue backpressure instead of deadlocking', async () => {
    let attempts = 0
    const wait = vi.fn().mockResolvedValue(undefined)
    const enqueue = vi.fn(async (value: number) => {
      attempts += 1
      if (attempts === 2) {
        const error = new Error('full') as Error & { code: string }
        error.code = 'SECURITY_QUEUE_FULL'
        throw error
      }
      return value
    })

    await expect(produceWithBackpressure([1, 2, 3], enqueue, wait))
      .resolves
      .toEqual([1, 2, 3])
    expect(wait).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledTimes(4)
  })

  it('rejects an active assessment that belongs to another execution scope', () => {
    const scope = [{ id: 'subject-1', sourceSortKey: 'a', subjectType: 'skill' as const }]
    expect(() => assertBatchEnqueueResults('batch-1', scope, [{
      assessment: {
        batch_id: null,
        execution_profile: 'configured',
        subject_id: 'subject-1',
        subject_type: 'skill',
      },
    }])).toThrowError(/批次范围冲突/)
  })

  it('fails local backfill preflight when service is paused or a required adapter is unavailable', () => {
    const healthy = {
      availableSubjectTypes: ['skill', 'mcp'] as const,
      issues: [],
      operational: true,
      ready: true,
      serviceEnabled: true,
      serviceStateVersion: 1,
      settings: { jobTimeoutSeconds: 600, workerConcurrency: 2 },
    }
    expect(() => assertLocalBackfillReadiness(healthy, ['skill'])).not.toThrow()
    expect(() => assertLocalBackfillReadiness({ ...healthy, serviceEnabled: false }, ['skill']))
      .toThrowError(/已暂停/)
    expect(() => assertLocalBackfillReadiness(healthy, ['prompt']))
      .toThrowError(/prompt/)
  })

  it('counts cancelled batch rows as unsuccessful and produces a non-zero exit', () => {
    const summary = summarizeBatchTerminalRows([{
      error_code: 'SECURITY_ASSESSMENT_CANCELLED',
      evaluation_method: null,
      original_verdict: null,
      status: 'cancelled',
    }], 1)

    expect(summary).toEqual({
      counts: { cancelled: 1 },
      errorCounts: { SECURITY_ASSESSMENT_CANCELLED: 1 },
      failed: 1,
    })
    expect(exitCodeForBackfill({
      failedSubjects: summary.failed,
      infrastructureFailed: false,
      interrupted: false,
    })).toBe(2)
  })

  it('accepts completed local document-evidence reports as successful backfill output', () => {
    expect(summarizeBatchTerminalRows([{
      error_code: null,
      evaluation_method: 'document_evidence',
      original_verdict: 'passed',
      status: 'completed',
    }], 1)).toEqual({
      counts: { passed: 1 },
      errorCounts: {},
      failed: 0,
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  applyBackfillLimit,
  expandBackfillSubjectTypes,
  isBackfillCandidate,
} from './subjects'

describe('security backfill subject policy', () => {
  it('expands public types to the exact eligible subject families', () => {
    expect(expandBackfillSubjectTypes(['skill'])).toEqual(['skill', 'skill_submission'])
    expect(expandBackfillSubjectTypes(['mcp'])).toEqual(['mcp', 'mcp_submission'])
    expect(expandBackfillSubjectTypes(['prompt'])).toEqual(['prompt'])
    expect(expandBackfillSubjectTypes(['prompt', 'skill', 'skill'])).toEqual([
      'skill',
      'skill_submission',
      'prompt',
    ])
  })

  it('selects missing/stale and transient failed states but preserves boundaries', () => {
    const common = {
      activeAssessmentId: null,
      ignoredAt: null,
      latestErrorCode: null,
      reportState: 'unassessed' as const,
    }
    expect(isBackfillCandidate(common)).toBe(true)
    expect(isBackfillCandidate({ ...common, reportState: 'stale' })).toBe(true)
    expect(isBackfillCandidate({
      ...common,
      latestErrorCode: 'SECURITY_SOURCE_FETCH_FAILED',
      reportState: 'failed',
    })).toBe(true)
    expect(isBackfillCandidate({
      ...common,
      latestErrorCode: 'SECURITY_ASSESSMENT_INPUT_CHANGED',
      reportState: 'failed',
    })).toBe(true)
    expect(isBackfillCandidate({
      ...common,
      latestErrorCode: 'SECURITY_SOURCE_NOT_ALLOWED',
      reportState: 'failed',
    })).toBe(false)
    expect(isBackfillCandidate({
      ...common,
      latestErrorCode: 'SECURITY_SOURCE_INVALID',
      reportState: 'failed',
    })).toBe(false)
    expect(isBackfillCandidate({ ...common, activeAssessmentId: 'active' })).toBe(false)
    expect(isBackfillCandidate({ ...common, ignoredAt: new Date() })).toBe(false)
    expect(isBackfillCandidate({ ...common, reportState: 'passed' })).toBe(false)
  })

  it('applies limits only after stable source ordering', () => {
    const scope = [
      { id: '3', sourceSortKey: 'z', subjectType: 'prompt' as const },
      { id: '2', sourceSortKey: 'a', subjectType: 'skill' as const },
      { id: '1', sourceSortKey: 'a', subjectType: 'skill' as const },
    ]

    expect(applyBackfillLimit(scope, 2).map(item => item.id)).toEqual(['1', '2'])
    expect(scope.map(item => item.id)).toEqual(['3', '2', '1'])
  })
})

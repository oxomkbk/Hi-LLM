import { describe, expect, it } from 'vitest'

import {
  createSourceCheckState,
  isCheckableGitSource,
  reduceSourceCheckState,
  sourceCheckKey,
  sourceLinkLabel,
} from './source-check-model'

import type { SecuritySourceCheckResult } from '@/lib/ai-security/source-check-contract'

describe('admin source check client state', () => {
  it('keeps concurrent rows pending independently and supports out-of-order completion', () => {
    const skillKey = sourceCheckKey('skill', 'shared-id')
    const mcpKey = sourceCheckKey('mcp', 'mcp-id')
    let state = createSourceCheckState()

    state = reduceSourceCheckState(state, { key: skillKey, type: 'start' })
    state = reduceSourceCheckState(state, { key: mcpKey, type: 'start' })
    expect([...state.pending]).toEqual([skillKey, mcpKey])

    state = reduceSourceCheckState(state, { key: mcpKey, result: result('acme/mcp'), type: 'succeed' })
    expect(state.pending.has(skillKey)).toBe(true)
    expect(state.pending.has(mcpKey)).toBe(false)
    expect(state.results[mcpKey]?.projectPath).toBe('acme/mcp')

    state = reduceSourceCheckState(state, { key: skillKey, type: 'fail' })
    expect(state.pending.size).toBe(0)
    expect(state.results[mcpKey]?.projectPath).toBe('acme/mcp')
  })

  it('does not collide when two subject types share the same database ID', () => {
    const skillKey = sourceCheckKey('skill', 'same-id')
    const submissionKey = sourceCheckKey('skill_submission', 'same-id')
    let state = createSourceCheckState()

    state = reduceSourceCheckState(state, { key: skillKey, result: result('acme/skill'), type: 'succeed' })
    state = reduceSourceCheckState(state, { key: submissionKey, result: result('acme/submission'), type: 'succeed' })

    expect(skillKey).not.toBe(submissionKey)
    expect(state.results[skillKey]?.projectPath).toBe('acme/skill')
    expect(state.results[submissionKey]?.projectPath).toBe('acme/submission')
  })

  it('treats duplicate starts as one pending source check', () => {
    const key = sourceCheckKey('mcp_submission', 'one-id')
    let state = createSourceCheckState()

    state = reduceSourceCheckState(state, { key, type: 'start' })
    state = reduceSourceCheckState(state, { key, type: 'start' })

    expect(state.pending.size).toBe(1)
  })

  it('produces compact repository labels without trusting arbitrary URL text', () => {
    expect(sourceLinkLabel('https://github.com/acme/skills/tree/main/review')).toEqual({
      label: 'GitHub · acme/skills',
      projectPath: 'acme/skills',
      provider: 'github',
    })
    expect(sourceLinkLabel('https://gitlab.com/acme/team/mcp/-/tree/main/server')).toEqual({
      label: 'GitLab · acme/team/mcp',
      projectPath: 'acme/team/mcp',
      provider: 'gitlab',
    })
    expect(sourceLinkLabel('https://catalog.example/resources/demo')).toEqual({
      label: '查看来源',
      projectPath: null,
      provider: null,
    })
    expect(sourceLinkLabel('not a url')).toEqual({
      label: '查看来源',
      projectPath: null,
      provider: null,
    })
    expect(isCheckableGitSource('https://github.com/acme/skills')).toBe(true)
    expect(isCheckableGitSource('https://gitlab.com/acme/team/mcp')).toBe(true)
    expect(isCheckableGitSource('https://catalog.example/resources/demo')).toBe(false)
    expect(isCheckableGitSource('not a url')).toBe(false)
  })
})

function result(projectPath: string): SecuritySourceCheckResult {
  return {
    archiveBytes: 512,
    canonicalUrl: `https://github.com/${projectPath}`,
    checkedAt: '2026-09-01T00:00:00.000Z',
    fileCount: 2,
    projectPath,
    provider: 'github',
    ref: 'HEAD',
    sourceRevision: 'abcdef0123456789abcdef0123456789abcdef01',
    subdirectory: null,
    totalBytes: 128,
  }
}

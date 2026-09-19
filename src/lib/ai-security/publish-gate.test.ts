import { describe, expect, it } from 'vitest'

import { evaluateAiContentPublishGate } from './publish-gate'

import type { PoolClient, QueryResult } from 'pg'

describe('aI content publish gate mode mapping', () => {
  it('uses mcp mode for both MCP subject types even when skill mode is off', async () => {
    const calls: Array<{ params?: unknown[], sql: string }> = []
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ params, sql })
        if (calls.length === 1)
          return { rows: [{ mode: params?.[0] === 'mcp' ? 'enforce' : 'off' }] } as QueryResult
        return { rows: [] } as unknown as QueryResult
      },
    } as unknown as PoolClient

    const submission = await evaluateAiContentPublishGate(client, 'mcp', {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'mcp_submission',
    })
    expect(submission.allowed).toBe(false)
    expect(submission.reason).toBe('valid_report_required')
    expect(calls[0].params).toEqual(['mcp'])
    expect(calls[0].sql).toContain('mcp_mode')
  })

  it('does not enforce MCP settings for Skill subjects', async () => {
    const client = {
      query: async (_sql: string, params?: unknown[]) => ({
        rows: [{ mode: params?.[0] === 'skill' ? 'off' : 'enforce' }],
      }),
    } as unknown as PoolClient

    const result = await evaluateAiContentPublishGate(client, 'skill', {
      id: '00000000-0000-4000-8000-000000000002',
      type: 'skill',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('mode_not_enforced')
  })

  it('uses the Prompt mode and returns an actionable message when no matching report exists', async () => {
    const client = {
      query: async (_sql: string, params?: unknown[]) => ({
        rows: params?.[0] === 'prompt' ? [{ mode: 'enforce' }] : [],
      }),
    } as unknown as PoolClient

    const result = await evaluateAiContentPublishGate(client, 'prompt', null)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('valid_report_required')
    expect(result.message).toContain('与当前内容匹配的安全评测')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  ensureBusinessUser: vi.fn(),
  withWonderlandWriteTransaction: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('../../db/business', () => ({ ensureBusinessUser: mocks.ensureBusinessUser }))
vi.mock('../../security', () => ({ createSecurityHash: vi.fn(() => 'actor-hash') }))
vi.mock('../write-transaction', () => ({
  withWonderlandWriteTransaction: mocks.withWonderlandWriteTransaction,
}))

const { moderateWonderDiscussion, moderateWonderQuestion } = await import('./admin')

const actor = {
  email: 'admin@hillm.ai',
  id: '3e7ea1a2-944a-4ae5-b03c-3e8f3d8ca91e',
  role: 'admin' as const,
}
const answerId = '9476c415-584c-48dd-8f6d-4370562979d2'
const questionId = 'f61b3e3f-e1aa-4472-a772-39562a69e813'

describe('wonderland admin moderation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withWonderlandWriteTransaction.mockImplementation(async (_input, callback) => callback(mocks.client))
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.wonder_answers'))
        return { rowCount: 1, rows: [{ question_id: questionId, visibility: 'visible' }] }
      if (sql.includes('from public.wonder_questions') && sql.includes('for update'))
        return { rowCount: 1, rows: [{ is_closed: true, is_locked: false, visibility: 'deleted' }] }
      return { rowCount: 1, rows: [] }
    })
  })

  it('soft deletes an answer, clears acceptance, audits, and recounts', async () => {
    await moderateWonderDiscussion({ action: 'delete', actor, id: answerId, reason: '后台删除回答', type: 'answer' })

    const calls = mocks.client.query.mock.calls.map(([sql, values]) => ({ sql: String(sql), values }))
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('update public.wonder_answers'), values: [answerId, 'deleted'] }),
      expect.objectContaining({ sql: expect.stringContaining('accepted_answer_id = null'), values: [questionId, answerId] }),
      expect.objectContaining({ sql: expect.stringContaining('insert into public.wonder_moderation_events') }),
    ]))
    expect(calls.filter(call => call.sql.includes('set answer_count'))).toHaveLength(1)
  })

  it('restores a deleted answer without automatically accepting it again', async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.wonder_answers'))
        return { rowCount: 1, rows: [{ question_id: questionId, visibility: 'deleted' }] }
      return { rowCount: 1, rows: [] }
    })

    await moderateWonderDiscussion({ action: 'restore', actor, id: answerId, reason: '后台恢复回答', type: 'answer' })

    const calls = mocks.client.query.mock.calls.map(([sql, values]) => ({ sql: String(sql), values }))
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('update public.wonder_answers'), values: [answerId, 'visible'] }),
    ]))
    expect(calls.some(call => call.sql.includes('accepted_answer_id = null'))).toBe(false)
  })

  it('restores a deleted question while preserving its closed and locked state', async () => {
    await moderateWonderQuestion({ action: 'restore', actor, id: questionId, reason: '后台恢复问题' })

    const update = mocks.client.query.mock.calls.find(([sql]) => String(sql).includes('update public.wonder_questions'))
    expect(update?.[1]).toEqual([questionId, 'visible', true, false])
    expect(String(update?.[0])).toContain('deleted_at = case when $2 = \'deleted\'')
  })
})

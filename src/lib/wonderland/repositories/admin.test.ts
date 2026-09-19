import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryBusiness: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('../../db/business', () => ({ queryBusiness: mocks.queryBusiness }))

const { listAdminWonderDiscussion, listAdminWonderQuestions } = await import('./admin')

describe('wonderland admin moderation lists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryBusiness.mockResolvedValue({ rows: [] })
  })

  it('excludes deleted questions from the default active list', async () => {
    await listAdminWonderQuestions({ limit: 20, offset: 0 })

    const [sql, values] = mocks.queryBusiness.mock.calls[0]!
    expect(String(sql)).toContain('question.visibility <> \'deleted\'')
    expect(values).toEqual([20, 0])
  })

  it('can explicitly open the deleted-question recycle bin', async () => {
    await listAdminWonderQuestions({ limit: 20, offset: 0, visibility: 'deleted' })

    const [sql, values] = mocks.queryBusiness.mock.calls[0]!
    expect(String(sql)).toContain('question.visibility = $1')
    expect(String(sql)).not.toContain('question.visibility <> \'deleted\'')
    expect(values).toEqual(['deleted', 20, 0])
  })

  it('excludes deleted answers and parent-deleted questions by default', async () => {
    await listAdminWonderDiscussion({ limit: 20, offset: 0, type: 'answer' })

    const [sql, values] = mocks.queryBusiness.mock.calls[0]!
    expect(String(sql)).toContain('answer.visibility <> \'deleted\'')
    expect(String(sql)).toContain('question.visibility <> \'deleted\'')
    expect(values).toEqual([20, 0])
  })

  it('shows deleted answers only when their parent question is active', async () => {
    await listAdminWonderDiscussion({ limit: 20, offset: 0, type: 'answer', visibility: 'deleted' })

    const [sql, values] = mocks.queryBusiness.mock.calls[0]!
    expect(String(sql)).toContain('answer.visibility = $1')
    expect(String(sql)).toContain('question.visibility <> \'deleted\'')
    expect(values).toEqual(['deleted', 20, 0])
  })
})

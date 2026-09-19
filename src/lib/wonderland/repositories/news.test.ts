import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryBusiness: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('../../db/business', () => ({ queryBusiness: mocks.queryBusiness }))

const { listPublicWonderlandNewsPage } = await import('./news')

describe('public Wonderland news archive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters published articles with parameters and clamps an overflowing page', async () => {
    mocks.queryBusiness
      .mockResolvedValueOnce({ rows: [{ total: '25' }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await listPublicWonderlandNewsPage({
      categorySlug: 'developer-basics',
      page: 99,
      pageSize: 12,
      q: '100%_guide',
    })

    expect(result).toEqual({ list: [], page: 3, pageSize: 12, total: 25, totalPages: 3 })
    expect(mocks.queryBusiness).toHaveBeenCalledTimes(2)

    const [countSql, countValues] = mocks.queryBusiness.mock.calls[0]
    expect(String(countSql)).toContain('article.status = \'published\'')
    expect(String(countSql)).toContain('article.published_at <= now()')
    expect(String(countSql)).toContain('category.slug = $1')
    expect(String(countSql)).toContain('article.content_text ilike $2')
    expect(countValues).toEqual(['developer-basics', '%100\\%\\_guide%'])

    const [listSql, listValues] = mocks.queryBusiness.mock.calls[1]
    expect(String(listSql)).toContain('limit $3')
    expect(String(listSql)).toContain('offset $4')
    expect(listValues).toEqual(['developer-basics', '%100\\%\\_guide%', 12, 24])
  })

  it('returns a stable first page for an empty archive', async () => {
    mocks.queryBusiness
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(
      listPublicWonderlandNewsPage({ page: -4, pageSize: 100 }),
    ).resolves.toEqual({ list: [], page: 1, pageSize: 48, total: 0, totalPages: 1 })

    expect(mocks.queryBusiness.mock.calls[1]?.[1]).toEqual([48, 0])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryBusiness: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/business', () => ({ queryBusiness: mocks.queryBusiness }))

const { listMediaLibrary } = await import('./media-library-service')

describe('media library visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryBusiness
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [{
          created_at: new Date('2026-09-15T00:00:00.000Z'),
          id: '00000000-0000-4000-8000-000000000001',
          mime_type: 'image/png',
          original_name: 'cover.png',
          owner_email: 'owner@example.com',
          owner_id: '00000000-0000-4000-8000-000000000002',
          size_bytes: '1024',
        }],
      })
  })

  it('restricts an ordinary user to files they own', async () => {
    const actorId = '00000000-0000-4000-8000-000000000002'
    const result = await listMediaLibrary({
      actorId,
      actorRole: 'user',
      kind: 'image',
      page: 1,
      pageSize: 24,
    })

    const sql = mocks.queryBusiness.mock.calls.map(call => String(call[0])).join('\n')
    expect(sql).toContain('file.owner_id = $1::uuid')
    expect(mocks.queryBusiness.mock.calls[0]?.[1]).toEqual([actorId, 'image/%'])
    expect(mocks.queryBusiness.mock.calls[1]?.[1]).toEqual([actorId, 'image/%', 24, 0])
    expect(result.list[0]).not.toHaveProperty('owner')
  })

  it('allows an administrator to browse every ready file with owner context', async () => {
    const result = await listMediaLibrary({
      actorId: '00000000-0000-4000-8000-000000000003',
      actorRole: 'admin',
      kind: 'all',
      page: 1,
      pageSize: 24,
    })

    const sql = mocks.queryBusiness.mock.calls.map(call => String(call[0])).join('\n')
    expect(sql).not.toContain('file.owner_id =')
    expect(mocks.queryBusiness.mock.calls[0]?.[1]).toEqual([])
    expect(mocks.queryBusiness.mock.calls[1]?.[1]).toEqual([24, 0])
    expect(result.list[0]?.owner).toEqual({
      email: 'owner@example.com',
      id: '00000000-0000-4000-8000-000000000002',
    })
  })
})

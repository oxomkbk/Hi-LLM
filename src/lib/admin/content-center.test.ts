import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryBusiness: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/business', () => ({ queryBusiness: mocks.queryBusiness }))

const { listAdminContent } = await import('./content-center')

describe('admin content center', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryBusiness.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) {
        return {
          rows: [{
            assessments: null,
            mcps: 'ds_mcps',
            prompts: null,
            security_states: null,
            skills: 'ds_skills',
          }],
        }
      }
      if (sql.includes('select count(*)::text as total'))
        return { rows: [{ total: '1' }] }
      if (sql.includes('select content.*')) {
        return {
          rows: [{
            created_at: new Date('2026-08-01T00:00:00.000Z'),
            featured: false,
            id: '00000000-0000-4000-8000-000000000001',
            owner: 'Admin',
            published_at: new Date('2026-08-02T00:00:00.000Z'),
            security_report_state: null,
            security_scan_status: null,
            security_score: null,
            slug: 'reliable-skill',
            status: 'published',
            summary: 'A reliable Skill',
            title: 'Reliable Skill',
            type: 'skill',
            updated_at: new Date('2026-08-03T00:00:00.000Z'),
          }],
        }
      }
      if (sql.includes('group by type, status'))
        return { rows: [{ status: 'published', total: '1', type: 'skill' }] }
      throw new Error(`Unexpected query: ${sql}`)
    })
  })

  it('keeps available channels working when one table and security tables are missing', async () => {
    const result = await listAdminContent({ limit: 20, offset: 0, security: 'unassessed' })
    const sql = mocks.queryBusiness.mock.calls.map(call => String(call[0])).join('\n')

    expect(result.unavailableTypes).toEqual(['prompt'])
    expect(result.list).toEqual([expect.objectContaining({ title: 'Reliable Skill', type: 'skill' })])
    expect(result.summary.byType.skill).toBe(1)
    expect(sql).not.toContain('from public.ds_prompts prompt')
    expect(sql).not.toContain('join public.ds_ai_security_subject_states')
  })
})

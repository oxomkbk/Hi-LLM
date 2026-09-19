import { describe, expect, it, vi } from 'vitest'

import { loadSecuritySubjectSnapshot } from './subject-repository'

vi.mock('server-only', () => ({}))

describe('security subject repository', () => {
  it('does not run concurrent queries through one PostgreSQL client', async () => {
    let active = 0
    let maximumActive = 0
    const client = {
      query: vi.fn(async (sql: string) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await Promise.resolve()
        active -= 1
        if (sql.includes('from public.ds_prompts')) {
          return {
            rows: [{
              compatibility: [],
              content_kind: 'prompt',
              slug: 'demo',
              summary: 'summary',
              title: 'Demo',
            }],
          }
        }
        return { rows: [] }
      }),
    }

    await loadSecuritySubjectSnapshot(client as never, 'prompt', '11111111-1111-4111-8111-111111111111')

    expect(maximumActive).toBe(1)
  })
})

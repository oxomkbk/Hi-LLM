import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AuthorizationError, requireSystemAdminSession, resolveSystemAdminUserId } from './session'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  optionalServerEnv: vi.fn(),
  query: vi.fn(),
  withControlTransaction: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db/control', () => ({
  getControlPool: () => ({ query: mocks.query }),
  withControlTransaction: mocks.withControlTransaction,
}))

vi.mock('@/lib/db/env', () => ({
  optionalServerEnv: mocks.optionalServerEnv,
}))

vi.mock('./index', () => ({
  auth: { api: { getSession: mocks.getSession } },
}))

beforeEach(() => {
  mocks.getSession.mockResolvedValue(adminSession('admin-1'))
  mocks.optionalServerEnv.mockReturnValue(undefined)
  mocks.query.mockResolvedValue({ rows: [{ id: 'admin-1' }] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('system administrator session', () => {
  it('uses the configured bootstrap administrator while setup is active', async () => {
    mocks.optionalServerEnv.mockReturnValue('admin-1')

    await expect(requireSystemAdminSession(new Headers())).resolves.toMatchObject({ user: { id: 'admin-1' } })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('uses the durable database selection after the bootstrap variable is removed', async () => {
    await expect(resolveSystemAdminUserId()).resolves.toBe('admin-1')
    await expect(requireSystemAdminSession(new Headers())).resolves.toMatchObject({ user: { id: 'admin-1' } })
  })

  it('rejects another active administrator from control-plane mutations', async () => {
    mocks.getSession.mockResolvedValue(adminSession('admin-2'))

    await expect(requireSystemAdminSession(new Headers())).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('fails closed when no active system administrator can be resolved', async () => {
    mocks.query.mockResolvedValue({ rows: [] })

    await expect(requireSystemAdminSession(new Headers())).rejects.toBeInstanceOf(AuthorizationError)
  })
})

function adminSession(id: string) {
  return {
    session: { token: 'session-token' },
    user: {
      emailVerified: true,
      id,
      role: 'admin',
      status: 'active',
    },
  }
}

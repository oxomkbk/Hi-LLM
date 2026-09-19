import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import proxy from './proxy'

const mocks = vi.hoisted(() => ({
  assertNavigationAiRequestOrigin: vi.fn(),
  assertSameOrigin: vi.fn(),
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/security', () => ({
  assertNavigationAiRequestOrigin: mocks.assertNavigationAiRequestOrigin,
  assertSameOrigin: mocks.assertSameOrigin,
}))

function createRequest(path: string, method = 'POST') {
  return new NextRequest(`https://nav.example.com${path}`, { method })
}

describe('proxy request origin routing', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the compatibility validator only for Navigation AI POST requests', async () => {
    const response = await proxy(createRequest('/api/public/navigation-ai'))

    expect(response.status).toBe(200)
    expect(mocks.assertNavigationAiRequestOrigin).toHaveBeenCalledOnce()
    expect(mocks.assertSameOrigin).not.toHaveBeenCalled()
  })

  it('keeps other public write APIs on the strict validator', async () => {
    const response = await proxy(createRequest('/api/submissions'))

    expect(response.status).toBe(200)
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce()
    expect(mocks.assertNavigationAiRequestOrigin).not.toHaveBeenCalled()
  })

  it('does not run either write validator for the Navigation AI status read', async () => {
    const response = await proxy(createRequest('/api/public/navigation-ai', 'GET'))

    expect(response.status).toBe(200)
    expect(mocks.assertSameOrigin).not.toHaveBeenCalled()
    expect(mocks.assertNavigationAiRequestOrigin).not.toHaveBeenCalled()
  })

  it('returns the existing 403 response when the compatibility validator rejects', async () => {
    mocks.assertNavigationAiRequestOrigin.mockImplementationOnce(() => {
      throw new Error('rejected')
    })

    const response = await proxy(createRequest('/api/public/navigation-ai'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.msg).toBe('请求来源校验失败')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

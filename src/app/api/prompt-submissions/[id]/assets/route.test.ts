import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  attachCommunityAsset: vi.fn(),
  findFile: vi.fn(),
  listOwnedAssets: vi.fn(),
  requireSubmissionAccess: vi.fn(),
  requireUserSession: vi.fn(),
}))

vi.mock('@/lib/access-settings/service', () => ({ requireSubmissionAccess: mocks.requireSubmissionAccess }))
vi.mock('@/lib/auth/session', () => ({ requireUserSession: mocks.requireUserSession }))
vi.mock('@/lib/prompts/http', () => ({
  promptErrorResponse: (error: { code?: string, message?: string, status?: number }) => Response.json({
    code: 500,
    data: null,
    error: { code: error.code ?? 'PROMPT_REQUEST_FAILED' },
    msg: error.message ?? 'Prompts 操作失败',
  }, { status: error.status ?? 400 }),
  promptSuccess: (data: unknown, message = '请求成功', status = 200) => Response.json({ code: 200, data, msg: message }, { status }),
}))
vi.mock('@/lib/repositories/files', () => ({ fileRepository: { findById: mocks.findFile } }))
vi.mock('@/lib/repositories/prompts', () => ({
  PromptRepositoryError: class PromptRepositoryError extends Error {
    constructor(message: string, readonly status = 400, readonly code = 'PROMPT_REPOSITORY_ERROR') {
      super(message)
    }
  },
  promptRepository: {
    attachCommunityAsset: mocks.attachCommunityAsset,
    listOwnedCommunityDraftAssets: mocks.listOwnedAssets,
  },
}))
vi.mock('@/lib/security', () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  isUuid: (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}))

const { GET, POST } = await import('./route')

describe('prompt submission asset route', () => {
  const assetKey = '00000000-0000-4000-8000-000000000021'
  const fileId = '00000000-0000-4000-8000-000000000022'
  const promptId = '00000000-0000-4000-8000-000000000023'
  const userId = '00000000-0000-4000-8000-000000000024'
  const asset = { file_id: fileId, id: '00000000-0000-4000-8000-000000000025', source_path: `uploads/${assetKey}` }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSubmissionAccess.mockResolvedValue(null)
    mocks.requireUserSession.mockResolvedValue({ user: { id: userId } })
    mocks.findFile.mockResolvedValue({ extension: 'png', id: fileId, mime_type: 'image/png', original_name: 'preview.png', owner_id: userId, status: 'ready' })
    mocks.listOwnedAssets.mockResolvedValue([asset])
    mocks.attachCommunityAsset.mockResolvedValue({ asset, created: false })
  })

  it('lists only through the owned unfinished draft repository contract', async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/prompt-submissions/${promptId}/assets`),
      { params: Promise.resolve({ id: promptId }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.listOwnedAssets).toHaveBeenCalledWith(promptId, userId)
    expect((await response.json()).data).toEqual([asset])
  })

  it('rejects a missing or malformed assetKey before attaching', async () => {
    const response = await POST(
      new NextRequest(`http://localhost/api/prompt-submissions/${promptId}/assets`, {
        body: JSON.stringify({ assetKey: 'retry-key', fileId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      { params: Promise.resolve({ id: promptId }) },
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('PROMPT_ASSET_KEY_INVALID')
    expect(mocks.attachCommunityAsset).not.toHaveBeenCalled()
  })

  it('returns the existing PromptAsset shape for an idempotent retry', async () => {
    const response = await POST(
      new NextRequest(`http://localhost/api/prompt-submissions/${promptId}/assets`, {
        body: JSON.stringify({ assetKey, fileId, isPrimary: true, role: 'image' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      { params: Promise.resolve({ id: promptId }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.attachCommunityAsset).toHaveBeenCalledWith(promptId, userId, expect.objectContaining({ assetKey, fileId }))
    expect((await response.json()).data).toEqual(asset)
  })

  it('keeps a reused file in the material library when an idempotent retry reuses the original asset', async () => {
    const duplicateFileId = '00000000-0000-4000-8000-000000000026'
    mocks.findFile.mockResolvedValue({ extension: 'png', id: duplicateFileId, mime_type: 'image/png', original_name: 'preview.png', owner_id: userId, status: 'ready' })

    const response = await POST(
      new NextRequest(`http://localhost/api/prompt-submissions/${promptId}/assets`, {
        body: JSON.stringify({ assetKey, fileId: duplicateFileId, role: 'image' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      { params: Promise.resolve({ id: promptId }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.attachCommunityAsset).toHaveBeenCalledWith(promptId, userId, expect.objectContaining({ fileId: duplicateFileId }))
  })
})

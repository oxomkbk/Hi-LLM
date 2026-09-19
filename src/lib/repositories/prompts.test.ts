import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureBusinessUser: vi.fn(),
  evaluatePublishGate: vi.fn(),
  invalidateSecurityState: vi.fn(),
  loadSecuritySubjectSnapshot: vi.fn(),
  withBusinessTransaction: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/ai-security/invalidation', () => ({
  deleteSecuritySubjectState: vi.fn(),
  invalidateSecurityState: mocks.invalidateSecurityState,
}))
vi.mock('@/lib/ai-security/publish-gate', () => ({
  evaluateAiContentPublishGate: mocks.evaluatePublishGate,
}))
vi.mock('@/lib/ai-security/public-projection', () => ({
  securityJoins: vi.fn(() => ''),
  securityProjection: vi.fn(() => 'null as security_assessment_id'),
}))
vi.mock('@/lib/ai-security/subject-repository', () => ({
  loadSecuritySubjectSnapshot: mocks.loadSecuritySubjectSnapshot,
}))
vi.mock('@/lib/db/business', () => ({
  ensureBusinessUser: mocks.ensureBusinessUser,
  queryBusiness: vi.fn(),
  withBusinessTransaction: mocks.withBusinessTransaction,
}))

const { PromptRepository } = await import('./prompts')

describe('prompt repository publish gate', () => {
  const actor = { email: 'admin@example.com', id: '00000000-0000-4000-8000-000000000001' }
  const categoryId = '00000000-0000-4000-8000-000000000002'
  const promptId = '00000000-0000-4000-8000-000000000003'
  const input = {
    categoryIds: [categoryId],
    compatibility: ['Codex'],
    contentKind: 'web_ui' as const,
    documents: [{
      content: 'Build a restrained admin dashboard.',
      isPrimary: true,
      language: 'markdown',
      name: 'Prompt',
      role: 'prompt' as const,
      sourcePath: 'PROMPT.md',
    }],
    featured: false,
    primaryCategoryId: categoryId,
    slug: 'enterprise-admin',
    sort: 0,
    status: 'published' as const,
    summary: 'Enterprise admin prompt',
    tags: ['admin'],
    title: 'Enterprise admin',
  }

  let client: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('with recursive category_roots'))
          return { rows: [{ id: categoryId, root_kind: 'web_ui' }] }
        if (sql.includes('insert into public.ds_prompts'))
          return { rows: [{ id: promptId, publish_requested_at: null, status: 'draft' }] }
        if (sql.includes('select * from public.ds_prompts where'))
          return { rows: [{ id: promptId, publish_requested_at: new Date(), status: 'draft' }] }
        return { rows: [] }
      }),
    }
    mocks.withBusinessTransaction.mockImplementation(async callback => callback(client))
  })

  it('stages direct publication and requests an automatic assessment', async () => {
    mocks.loadSecuritySubjectSnapshot.mockResolvedValue({ declaredFingerprint: 'prompt-fingerprint' })
    mocks.evaluatePublishGate.mockResolvedValue({
      allowed: false,
      message: '发布前需要完成一次与当前内容匹配的安全评测',
      reason: 'valid_report_required',
    })

    const result = await new PromptRepository().create(input, actor)

    expect(result?.status).toBe('draft')
    expect(result?.publish_requested_at).toBeTruthy()
    expect(mocks.evaluatePublishGate).toHaveBeenCalledWith(
      client,
      'prompt',
      { id: promptId, type: 'prompt' },
      'prompt-fingerprint',
    )
  })

  it('checks the fingerprint produced by the saved draft before publishing it', async () => {
    mocks.loadSecuritySubjectSnapshot.mockResolvedValue({
      declaredFingerprint: 'prompt-fingerprint',
      id: promptId,
      name: input.title,
      payload: {},
      slug: input.slug,
      subjectType: 'prompt',
    })
    mocks.evaluatePublishGate.mockResolvedValue({
      allowed: false,
      message: '检测到可能执行危险操作的内容，请先处理危险项',
      reason: 'danger_review_required',
    })

    const result = await new PromptRepository().update(promptId, input, actor, {
      id: promptId,
      slug: input.slug,
      status: 'draft',
    } as never)

    expect(result?.status).toBe('draft')
    expect(result?.publish_requested_at).toBeTruthy()
    expect(mocks.invalidateSecurityState).toHaveBeenCalledWith(
      client,
      { id: promptId, type: 'prompt' },
      'prompt-fingerprint',
    )
    expect(mocks.evaluatePublishGate).toHaveBeenCalledWith(
      client,
      'prompt',
      { id: promptId, type: 'prompt' },
      'prompt-fingerprint',
    )
  })

  it('rechecks published content when an administrator edits it in place', async () => {
    mocks.loadSecuritySubjectSnapshot.mockResolvedValue({
      declaredFingerprint: 'updated-prompt-fingerprint',
      id: promptId,
      name: input.title,
      payload: {},
      slug: input.slug,
      subjectType: 'prompt',
    })
    mocks.evaluatePublishGate.mockResolvedValue({
      allowed: false,
      message: '发布前需要完成一次与当前内容匹配的安全评测',
      reason: 'valid_report_required',
    })

    const promise = new PromptRepository().update(promptId, input, actor, {
      id: promptId,
      slug: input.slug,
      status: 'published',
    } as never)

    await expect(promise).rejects.toEqual(expect.objectContaining({
      code: 'PROMPT_SECURITY_GATE_BLOCKED',
      status: 409,
    }))
    expect(mocks.evaluatePublishGate).toHaveBeenCalledWith(
      client,
      'prompt',
      { id: promptId, type: 'prompt' },
      'updated-prompt-fingerprint',
    )
  })
})

describe('community prompt asset transactions', () => {
  const assetId = '00000000-0000-4000-8000-000000000011'
  const assetKey = '00000000-0000-4000-8000-000000000012'
  const fileId = '00000000-0000-4000-8000-000000000013'
  const promptId = '00000000-0000-4000-8000-000000000014'
  const userId = '00000000-0000-4000-8000-000000000015'
  const input = {
    assetKey,
    fileId,
    isPrimary: true,
    name: 'preview.png',
    role: 'image' as const,
  }

  let client: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    client = { query: vi.fn() }
    mocks.withBusinessTransaction.mockImplementation(async callback => callback(client))
  })

  it('locks the owned unfinished draft and reuses a stable asset key without inserting', async () => {
    const existing = {
      file_id: '00000000-0000-4000-8000-000000000016',
      id: assetId,
      origin: 'direct_upload',
      prompt_id: promptId,
      source_path: `uploads/${assetKey}`,
    }
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.ds_prompts'))
        return { rows: [{ id: promptId }] }
      if (sql.includes('from public.file_objects'))
        return { rows: [{ id: fileId }] }
      if (sql.includes('source_path = $2'))
        return { rows: [existing] }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const result = await new PromptRepository().attachCommunityAsset(promptId, userId, input)

    expect(result).toEqual({ asset: existing, created: false })
    expect(client.query.mock.calls[0]?.[0]).toContain('for update')
    expect(client.query.mock.calls[0]?.[0]).toContain('submitted_at is null')
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('source_path = $2'),
      [promptId, `uploads/${assetKey}`, fileId],
    )
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('insert into public.ds_prompt_assets'))).toBe(false)
  })

  it('enforces the twelve-asset limit inside the locked transaction', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.ds_prompts'))
        return { rows: [{ id: promptId }] }
      if (sql.includes('from public.file_objects'))
        return { rows: [{ id: fileId }] }
      if (sql.includes('source_path = $2'))
        return { rows: [] }
      if (sql.includes('count(*)::int'))
        return { rows: [{ total: 12 }] }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(new PromptRepository().attachCommunityAsset(promptId, userId, input)).rejects.toEqual(expect.objectContaining({
      code: 'PROMPT_ASSET_LIMIT_REACHED',
      status: 409,
    }))
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('insert into public.ds_prompt_assets'))).toBe(false)
  })

  it('serializes completion with asset mutations and sets submitted_at once', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id from public.ds_prompts'))
        return { rows: [{ id: promptId }] }
      if (sql.includes('update public.ds_prompts'))
        return { rows: [{ id: promptId }] }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(new PromptRepository().finalizeCommunitySubmission(promptId, userId)).resolves.toEqual({ id: promptId })
    expect(client.query.mock.calls[0]?.[0]).toContain('for update')
    expect(client.query.mock.calls[1]?.[0]).toContain('submitted_at is null')
  })

  it('rejects resource deletion after completion before reading the asset row', async () => {
    client.query.mockResolvedValueOnce({ rows: [] })

    await expect(new PromptRepository().removeCommunityAsset(promptId, assetId, userId)).rejects.toEqual(expect.objectContaining({
      code: 'PROMPT_COMMUNITY_DRAFT_UNAVAILABLE',
      status: 404,
    }))
    expect(client.query).toHaveBeenCalledTimes(1)
  })
})

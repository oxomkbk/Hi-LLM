import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchCatalogWithAi } from './service'

import type { CatalogAiCandidate } from './types'

const mocks = vi.hoisted(() => ({
  callLlmText: vi.fn(),
  getNavigationAiRuntimeConfig: vi.fn(),
  listCatalogAiCandidates: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/llm/client', () => ({ callLlmText: mocks.callLlmText }))
vi.mock('@/lib/llm/settings', () => ({ getNavigationAiRuntimeConfig: mocks.getNavigationAiRuntimeConfig }))
vi.mock('./repository', () => ({ listCatalogAiCandidates: mocks.listCatalogAiCandidates }))

const questionId = 'question:2e7fead0-7a6e-4ee5-92cf-94bc67b7f521'
const question: CatalogAiCandidate = {
  categories: ['技术与工程'],
  commonlyUsed: true,
  description: '介绍如何在持续新增数据时选择稳定且可验证的分页方案。',
  external: false,
  id: questionId,
  image: null,
  kind: '问题',
  logo: null,
  name: 'Cursor 分页应该包含什么？',
  pinned: false,
  recommend: false,
  scope: 'wonderland',
  searchText: '正文讨论了 offset 重复、游标稳定排序与新增数据一致性。',
  tags: ['数据库', 'API'],
  url: '/wonderland/questions/cursor-pagination',
  visitCount: 28,
  vpn: false,
}

describe('catalog AI service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getNavigationAiRuntimeConfig.mockResolvedValue({})
    mocks.listCatalogAiCandidates.mockResolvedValue([question])
    mocks.callLlmText
      .mockResolvedValueOnce(JSON.stringify({
        categories: ['技术与工程'],
        constraints: [],
        keywords: ['分页'],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        answer: '**这个问题最贴近你的需求。**',
        resultIds: ['invented-id', questionId],
        suggestions: ['还想看数据库问题吗？'],
      }))
  })

  it('keeps recommendations inside the requested scope and candidate allowlist', async () => {
    const result = await searchCatalogWithAi('wonderland', [{ content: '怎么设计分页？', role: 'user' }])

    expect(mocks.listCatalogAiCandidates).toHaveBeenCalledWith('wonderland', expect.arrayContaining(['分页']))
    expect(result).toEqual({
      answer: '这个问题最贴近你的需求。',
      results: [{
        description: question.description,
        external: false,
        href: question.url,
        id: questionId,
        image: null,
        kind: '问题',
        meta: ['技术与工程'],
        title: question.name,
        visitId: null,
        vpn: false,
      }],
      scope: 'wonderland',
      suggestions: [],
    })
  })

  it('returns a scope-specific empty state after intent retrieval without ranking candidates', async () => {
    mocks.listCatalogAiCandidates.mockResolvedValue([])

    const result = await searchCatalogWithAi('prompts', [{ content: '电商海报', role: 'user' }])

    expect(result).toEqual({
      answer: 'Prompts 目录里暂时还没有可推荐的内容。',
      results: [],
      scope: 'prompts',
      suggestions: [],
    })
    expect(mocks.callLlmText).toHaveBeenCalledTimes(1)
  })
})

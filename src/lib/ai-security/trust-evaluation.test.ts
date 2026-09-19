import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { evaluateTrustedContent } from './trust-evaluation'

const mocks = vi.hoisted(() => ({
  callLlmText: vi.fn(),
  getLlmRuntimeConfig: vi.fn(),
}))
const ORIGINAL_LOCAL_ONLY = process.env.AI_SECURITY_LOCAL_ONLY

vi.mock('@/lib/llm/client', () => ({ callLlmText: mocks.callLlmText }))
vi.mock('@/lib/llm/settings', () => ({ getLlmRuntimeConfig: mocks.getLlmRuntimeConfig }))
vi.mock('server-only', () => ({}))

const coverage = {
  included: ['SKILL.md'],
  level: 'partial' as const,
  partitions: {
    platformContent: { includedCount: 1, skippedCount: 0, status: 'complete' as const },
    source: { includedCount: 0, skippedCount: 1, status: 'partial' as const },
  },
  skipped: [{ reason: '外部页面未抓取', ref: 'skill/external-source-page' }],
  sourceRevision: null,
}

describe('trusted content evaluation', () => {
  beforeEach(() => {
    process.env.AI_SECURITY_LOCAL_ONLY = 'false'
    mocks.callLlmText.mockReset()
    mocks.getLlmRuntimeConfig.mockReset()
    mocks.getLlmRuntimeConfig.mockResolvedValue({
      apiKey: 'test',
      baseUrl: 'https://llm.example/v1',
      model: 'test-model',
      protocol: 'openai',
    })
  })

  afterAll(() => {
    if (ORIGINAL_LOCAL_ONLY === undefined)
      delete process.env.AI_SECURITY_LOCAL_ONLY
    else
      process.env.AI_SECURITY_LOCAL_ONLY = ORIGINAL_LOCAL_ONLY
  })

  it('returns a document-evidence report when the model returns no final text', async () => {
    mocks.callLlmText.mockRejectedValue(new Error('大模型没有返回文本内容'))

    const evaluation = await evaluateTrustedContent({
      content: { description: '一段足够长的站内 Skill 使用说明。'.repeat(20) },
      coverage,
      documents: [{ content: '# 使用场景\n\n用于发布前复核。\n\n## 验证\n\n运行测试确认结果。', path: 'SKILL.md' }],
      findings: [],
      name: '站内 Skill',
      subjectType: 'skill',
    })

    expect(evaluation.method).toBe('document_evidence')
    expect(evaluation.dimensions).toHaveLength(5)
    expect(evaluation.summary).toContain('站内 Skill')
  })

  it('does not call the model when AI assistance is explicitly disabled', async () => {
    const evaluation = await evaluateTrustedContent({
      aiAssistance: 'disabled',
      content: { description: '站内发布说明' },
      coverage,
      documents: [{ content: '# 使用说明\n\n用于站内任务。', path: 'SKILL.md' }],
      findings: [],
      name: '站内 Skill',
      subjectType: 'skill',
    })

    expect(evaluation.method).toBe('document_evidence')
    expect(evaluation.dimensions).toHaveLength(5)
    expect(evaluation.score).toBeTypeOf('number')
    expect(evaluation.summary).toContain('站内 Skill')
    expect(mocks.getLlmRuntimeConfig).not.toHaveBeenCalled()
    expect(mocks.callLlmText).not.toHaveBeenCalled()
  })

  it('keeps the hybrid method when all AI dimensions are valid', async () => {
    mocks.callLlmText.mockResolvedValue(JSON.stringify({
      dimensions: ['reliability', 'applicability', 'maintainability', 'effectiveness'].map(code => ({
        code,
        evidence: ['可验证材料'],
        recommendations: ['继续维护'],
        score: 4,
        strengths: ['结构清晰'],
        summary: '该维度具备可验证的基础材料。',
        weaknesses: [],
      })),
    }))

    const evaluation = await evaluateTrustedContent({
      content: { description: '评测材料' },
      coverage,
      findings: [],
      name: '仓库 Skill',
      subjectType: 'skill',
    })

    expect(evaluation.method).toBe('hybrid')
    expect(evaluation.model).toBe('test-model')
    expect(evaluation.schemaVersion).toBe('trusted-eval-v1')
    expect(evaluation.dimensions).toHaveLength(5)
    expect(evaluation.score).toBeGreaterThan(0)
    expect(evaluation.summary).toContain('当前最需要关注的是')
    expect(evaluation.dimensions.slice(1).every(dimension => dimension.source === 'ai_assisted')).toBe(true)
  })
})

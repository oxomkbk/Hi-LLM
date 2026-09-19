import { describe, expect, it } from 'vitest'

import {
  presentSecurityPolicyCopy,
  securityBadgePresentation,
  securityExecutionModeLabel,
  securityPassedLabel,
  securityQualityScoreLabel,
  securityReportDisplayMode,
} from './presentation'

describe('presentSecurityPolicyCopy', () => {
  it('translates obsolete manual-review wording for advisory-only reports', () => {
    expect(presentSecurityPolicyCopy(
      '综合评级：一般。当前最需要关注的是安全可信：本次仅配置覆盖发现 2 项风险，最高级别为中危；安全结论应结合发现详情与未覆盖范围复核。',
      { advisoryFindingCount: 2, advisoryOnly: true },
    )).toBe('综合评级：一般。当前最需要关注的是安全可信：本次自动评测发现 2 条改进建议；这些建议影响评分，但不会增加人工发布流程。')
  })

  it('keeps immutable historical wording when a dangerous finding remains', () => {
    const text = '发现危险行为，需要人工复核。'
    expect(presentSecurityPolicyCopy(text, { advisoryFindingCount: 0, advisoryOnly: false })).toBe(text)
  })

  it('updates obsolete advisory recommendations without changing the stored report', () => {
    expect(presentSecurityPolicyCopy(
      '在源码扫描适配器完成后重新评测，再用于强制发布门禁。',
      { advisoryFindingCount: 1, advisoryOnly: true },
    )).toBe('在源码扫描适配器完成后重新评测，以提升报告覆盖率和结论置信度。')
  })

  it('does not describe deterministic quality scoring as a pending manual review', () => {
    expect(presentSecurityPolicyCopy(
      '材料具备基础可审计性；由于未获得 AI 质量复核，本次采用保守评分。',
      { advisoryFindingCount: 0, advisoryOnly: false },
    )).toBe('材料具备基础可审计性；当前质量维度仅由确定性规则评估，本次采用保守评分。')
  })

  it('shows quality scoring only for completed hybrid evaluation', () => {
    expect(securityQualityScoreLabel(3.2, 'deterministic')).toBeNull()
    expect(securityQualityScoreLabel(3.8, 'document_evidence')).toBe('材料评测 3.8 / 5')
    expect(securityQualityScoreLabel(4.1, 'hybrid')).toBe('AI 辅助 4.1 / 5')
    expect(securityQualityScoreLabel(null, 'deterministic')).toBeNull()
  })

  it('separates evidence, documented, hybrid and legacy report views', () => {
    expect(securityReportDisplayMode('deterministic')).toBe('evidence')
    expect(securityReportDisplayMode('document_evidence')).toBe('documented')
    expect(securityReportDisplayMode('hybrid')).toBe('hybrid')
    expect(securityReportDisplayMode(null)).toBe('legacy')
  })

  it('turns technical report gaps into useful non-failure guidance', () => {
    expect(securityBadgePresentation({
      method: null,
      qualityScore: null,
      securityScore: null,
      state: 'failed',
    })).toMatchObject({ compactLabel: '使用前核对', label: '当前依据待补充' })
    expect(securityBadgePresentation({
      method: null,
      qualityScore: null,
      securityScore: null,
      state: 'unassessed',
    })).toMatchObject({ compactLabel: '使用前核对', label: '当前依据待补充' })
    expect(securityBadgePresentation({
      method: null,
      qualityScore: null,
      securityScore: null,
      state: 'stale',
    })).toMatchObject({ compactLabel: '资料更新中', label: '参考资料正在自动更新' })
  })

  it('shows differentiated material scores for completed document reports', () => {
    expect(securityBadgePresentation({
      method: 'document_evidence',
      qualityScore: 3.8,
      securityScore: 100,
      state: 'passed',
    })).toEqual({
      compactLabel: '材料已检查',
      label: '材料评测已完成',
      score: '3.8',
      tone: 'passed',
    })
  })

  it('does not expose legacy scores on evidence badges', () => {
    expect(securityBadgePresentation({
      method: 'deterministic',
      qualityScore: null,
      securityScore: 100,
      state: 'passed',
    })).toEqual({
      compactLabel: '规则未命中',
      label: '已覆盖材料未命中规则',
      score: null,
      tone: 'passed',
    })
    expect(securityBadgePresentation({
      method: 'hybrid',
      qualityScore: 4.1,
      securityScore: 100,
      state: 'passed',
    }).score).toBe('4.1')
  })

  it('describes static success and execution mode conservatively', () => {
    expect(securityPassedLabel('passed')).toBe('已覆盖材料未命中规则')
    expect(securityPassedLabel('blocked')).toBeNull()
    expect(securityExecutionModeLabel('local_deterministic')).toBe('本地材料评测')
    expect(securityExecutionModeLabel('configured')).toBe('规则 + AI')
  })
})

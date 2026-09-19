export interface SecurityPolicyDisplayContext {
  advisoryFindingCount: number
  advisoryOnly: boolean
}

export function presentSecurityPolicyCopy(value: null | string | undefined, context: SecurityPolicyDisplayContext) {
  if (!value)
    return value ?? ''

  const normalized = value.replace(/由于未获得 AI 质量复核/gu, '当前质量维度仅由确定性规则评估')

  if (!context.advisoryOnly)
    return normalized

  const advisorySummary = `本次自动评测发现 ${context.advisoryFindingCount} 条改进建议；这些建议影响评分，但不会增加人工发布流程。`

  return normalized
    .replace(/本次[^。！？]*复核[。！？]?/gu, advisorySummary)
    .replace(/安全结论应结合[^。！？]*复核[。！？]?/gu, advisorySummary)
    .replace(/需结合详情复核[。！？]?/gu, '均作为改进建议展示，不影响自动发布。')
    .replace(/再用于强制发布门禁/gu, '以提升报告覆盖率和结论置信度')
}

export function securityBadgePresentation(input: {
  method: null | string | undefined
  qualityScore: null | number | undefined
  securityScore: null | number | undefined
  state: null | string | undefined
}) {
  const status = input.state === 'passed' && input.method === 'document_evidence'
    ? { compactLabel: '材料已检查', label: '材料评测已完成', tone: 'passed' as const }
    : ({
        blocked: { compactLabel: '有风险', label: '危险项待处理', tone: 'blocked' },
        failed: { compactLabel: '使用前核对', label: '当前依据待补充', tone: 'muted' },
        passed: { compactLabel: '规则未命中', label: '已覆盖材料未命中规则', tone: 'passed' },
        review_required: { compactLabel: '有建议', label: '有改进建议', tone: 'review' },
        stale: { compactLabel: '资料更新中', label: '参考资料正在自动更新', tone: 'muted' },
        unassessed: { compactLabel: '使用前核对', label: '当前依据待补充', tone: 'muted' },
      } as const)[input.state ?? 'unassessed'] ?? {
        compactLabel: '使用前核对',
        label: '当前依据待补充',
        tone: 'muted' as const,
      }
  const score = ['document_evidence', 'hybrid'].includes(input.method ?? '') && typeof input.qualityScore === 'number'
    ? input.qualityScore.toFixed(1)
    : !input.method && typeof input.securityScore === 'number'
        ? String(input.securityScore)
        : null
  return { ...status, score }
}

export function securityExecutionModeLabel(mode: 'configured' | 'local_deterministic') {
  return mode === 'local_deterministic' ? '本地材料评测' : '规则 + AI'
}

export function securityPassedLabel(reportState: null | string | undefined) {
  return reportState === 'passed' ? '已覆盖材料未命中规则' : null
}

export function securityQualityScoreLabel(
  score: null | number | undefined,
  method: null | string | undefined,
) {
  if (!['document_evidence', 'hybrid'].includes(method ?? '') || typeof score !== 'number')
    return null
  return `${method === 'document_evidence' ? '材料评测' : 'AI 辅助'} ${score.toFixed(1)} / 5`
}

export function securityReportDisplayMode(method: null | string | undefined): 'documented' | 'evidence' | 'hybrid' | 'legacy' {
  if (method === 'deterministic')
    return 'evidence'
  if (method === 'document_evidence')
    return 'documented'
  if (method === 'hybrid')
    return 'hybrid'
  return 'legacy'
}

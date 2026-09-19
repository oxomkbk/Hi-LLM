import { normalizeCoverage } from './coverage'
import {
  calculateTrustScore,
  trustRatingForScore,
  trustRoundScore,
  trustSafetyScore,
} from './trust-policy'

import type { SecurityCoverageInput } from './coverage'
import type {
  SecurityDocumentEvaluation,
  SecuritySubjectType,
  SecurityTrustDimension,
  SecurityTrustDimensionCode,
} from './domain'
import type { NormalizedSecurityFinding } from './finalize'

interface EvidenceDocument {
  content: string
  path: string
}

interface EvidenceSignal {
  evidence: string
  label: string
  pattern: RegExp
  recommendation: string
  weight: number
}

const LABELS: Record<SecurityTrustDimensionCode, string> = {
  applicability: '场景适配',
  effectiveness: '使用效果',
  maintainability: '结构规范',
  reliability: '稳定可靠',
  safety: '安全可信',
}

const QUALITY_SIGNALS: Record<Exclude<SecurityTrustDimensionCode, 'safety'>, EvidenceSignal[]> = {
  applicability: [
    signal('明确用途或触发场景', /\b(?:use\s+(?:this|when)|use cases?|scenario|purpose)\b|适合|适用|用于|使用场景|触发条件/i, '补充资源解决的问题和触发场景。', 0.8),
    signal('说明目标用户或运行环境', /\b(?:audience|developer|team|operator|agent|platform|environment)\b|用户|团队|开发者|管理员|平台|运行环境/i, '说明适合的用户角色和运行环境。', 0.6),
    signal('说明输入信息', /\binputs?\b|输入|参数|前置材料/i, '列出开始任务前需要提供的输入。', 0.6),
    signal('说明输出或适用边界', /\boutputs?\b|\b(?:limitations?|constraints?)\b|输出|结果|限制|边界/i, '说明输出形式和不适用边界。', 0.6),
  ],
  effectiveness: [
    signal('包含顺序明确的操作步骤', /(?:^|\n)\s*(?:\d+[.)]|[-*]\s+\[[ x]\])\s+/m, '补充可按顺序执行的使用步骤。', 0.8),
    signal('包含可复用示例', /```[\s\S]{8,}?```|\bexamples?\b|示例|范例/i, '增加一组可直接复用的输入或命令示例。', 0.8),
    signal('说明预期结果', /\bexpected\s+(?:result|output|behavior)\b|预期结果|预期输出|完成标志/i, '说明完成后的可观察结果。', 0.8),
    signal('提供验证或验收方法', /\b(?:validate|validation|verify|verification|test|acceptance)\b|验证|校验|测试|验收/i, '补充验证结果是否正确的方法。', 0.7),
  ],
  maintainability: [
    signal('文档具有分层标题结构', /(?:^|\n)#{2,4}\s+\S+/m, '使用清晰章节组织安装、使用、限制和安全信息。', 0.6),
    signal('提供依赖或项目清单', /(?:package\.json|pyproject\.toml|requirements\S*\.txt|cargo\.toml|go\.mod)/i, '提供可复核的依赖或项目清单。', 0.8),
    signal('声明版本或变更信息', /\b(?:version|release|changelog)\b|版本|发布记录|变更记录/i, '声明当前版本及重要变更。', 0.6),
    signal('单独说明安装、配置或安全事项', /\b(?:installation|configuration|security)\b|安装|配置|安全说明/i, '补充安装、配置和安全章节。', 0.6),
  ],
  reliability: [
    signal('说明前置条件或依赖', /\b(?:prerequisites?|requirements?|requires?)\b|前置条件|依赖要求|运行要求/i, '列出运行所需版本、权限和依赖。', 0.7),
    signal('依赖或命令使用固定版本', /(?:[@^]|==|~=|~)\d+\.\d+(?:\.\d+)?|\bversion\s+\d+\.\d+/i, '为关键依赖或执行器声明固定版本。', 0.7),
    signal('提供故障处理信息', /\b(?:troubleshoot|failure|error|retry|fallback)\b|故障|错误处理|重试|回退|排障/i, '补充常见失败、恢复和回退方法。', 0.7),
    signal('提供验证或测试方式', /\b(?:validate|verify|test|health\s*check)\b|验证|校验|测试|健康检查/i, '增加可重复的验证或测试步骤。', 0.7),
  ],
}

export function evaluateDocumentEvidence(input: {
  coverage: SecurityCoverageInput
  documents: readonly EvidenceDocument[]
  findings: readonly NormalizedSecurityFinding[]
  name: string
  subjectType: SecuritySubjectType
}): SecurityDocumentEvaluation {
  const coverage = normalizeCoverage(input.coverage)
  const documents = input.documents.map(document => ({
    content: document.content.normalize('NFC'),
    path: document.path.normalize('NFC').trim(),
  }))
  const safety = safetyDimension(input.findings, coverage.level)
  const quality = (['reliability', 'applicability', 'maintainability', 'effectiveness'] as const)
    .map(code => qualityDimension(code, documents, coverage.level))
  const dimensions = [safety, ...quality]
  const score = calculateTrustScore(dimensions, input.findings)
  const rating = trustRatingForScore(score)
  const strongest = [...quality].sort((left, right) => right.score - left.score)[0]!
  const weakest = [...quality].sort((left, right) => left.score - right.score)[0]!
  const materialScope = coverage.level === 'config_only'
    ? '仅配置材料'
    : coverage.sourceRevision
      ? `固定源码 ${coverage.sourceRevision.slice(0, 8)}`
      : '当前站内材料'
  const riskNote = input.findings.some(finding => finding.severity === 'critical' || finding.severity === 'high')
    ? '发现高风险证据，使用前应先处理对应危险行为。'
    : input.findings.length > 0
      ? `发现 ${input.findings.length} 条具体使用建议。`
      : '当前材料未命中已知高风险规则。'

  return {
    dimensions,
    method: 'document_evidence',
    model: 'platform-document-rubric-v1',
    rating,
    schemaVersion: 'document-evidence-v1',
    score,
    summary: `${cleanName(input.name)}：基于${materialScope}，${LABELS[strongest.code]}证据最完整，${LABELS[weakest.code]}仍可补强。${riskNote}`,
  }
}

function cleanName(value: string) {
  return value.normalize('NFC').trim().slice(0, 180) || '当前资源'
}

function evidenceForSignal(documents: readonly EvidenceDocument[], item: EvidenceSignal) {
  const document = documents.find(candidate => item.pattern.test(candidate.content) || item.pattern.test(candidate.path))
  return document ? `${document.path} · ${item.evidence}` : null
}

function qualityDimension(
  code: Exclude<SecurityTrustDimensionCode, 'safety'>,
  documents: readonly EvidenceDocument[],
  coverageLevel: 'complete' | 'config_only' | 'partial',
): SecurityTrustDimension {
  const signals = QUALITY_SIGNALS[code]
  const matched = signals.map(item => ({ item, evidence: evidenceForSignal(documents, item) })).filter(result => result.evidence)
  const missing = signals.filter(item => !matched.some(result => result.item === item))
  const rawScore = 1.6 + matched.reduce((total, result) => total + result.item.weight, 0)
  const coverageCap = coverageLevel === 'complete' ? 5 : coverageLevel === 'partial' ? 4.6 : 3.5
  const score = trustRoundScore(Math.min(rawScore, coverageCap))
  const strengthText = matched.length > 0
    ? matched.slice(0, 2).map(result => result.item.label).join('、')
    : '尚未识别到明确的支持证据'
  const weaknessText = missing.length > 0
    ? missing.slice(0, 2).map(item => item.label).join('、')
    : '主要材料要素已覆盖'
  return {
    code,
    evidence: matched.slice(0, 3).map(result => result.evidence!),
    recommendations: missing.slice(0, 3).map(item => item.recommendation),
    score,
    source: 'deterministic',
    strengths: matched.slice(0, 3).map(result => result.item.label),
    summary: `${LABELS[code]}依据：${strengthText}；当前关注：${weaknessText}。`,
    weaknesses: missing.slice(0, 3).map(item => item.label),
  }
}

function safetyDimension(
  findings: readonly NormalizedSecurityFinding[],
  coverageLevel: 'complete' | 'config_only' | 'partial',
): SecurityTrustDimension {
  const serious = findings.filter(finding => finding.severity === 'critical' || finding.severity === 'high')
  return {
    code: 'safety',
    evidence: findings.slice(0, 3).map(finding => `${finding.artifactPath ?? '当前材料'} · ${finding.riskCode} · ${finding.title}`),
    recommendations: findings.length > 0
      ? findings.slice(0, 3).map(finding => finding.recommendation || `处理 ${finding.riskCode}`)
      : ['内容或依赖变化后重新评测', '运行第三方内容时继续使用最小权限和隔离环境'],
    score: trustSafetyScore(findings, coverageLevel),
    source: 'deterministic',
    strengths: findings.length === 0 ? ['当前材料未命中已知高风险规则'] : [],
    summary: serious.length > 0
      ? `发现 ${serious.length} 项高风险证据，已按具体文件和规则列出。`
      : findings.length > 0
        ? `发现 ${findings.length} 条可定位的使用建议，未发现需要阻断的高风险证据。`
        : '当前纳入材料未命中已知高风险规则；未执行的运行时行为不在本结论内。',
    weaknesses: coverageLevel === 'complete' ? [] : ['运行时行为未执行，结论限于当前纳入材料'],
  }
}

function signal(label: string, pattern: RegExp, recommendation: string, weight: number): EvidenceSignal {
  return { evidence: label, label, pattern, recommendation, weight }
}

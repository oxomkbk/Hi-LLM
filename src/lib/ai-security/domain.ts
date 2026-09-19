export const SECURITY_ASSESSMENT_STATUSES = [
  'queued',
  'preparing',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const

export const SECURITY_COVERAGE_LEVELS = ['complete', 'partial', 'config_only'] as const
export const SECURITY_EXECUTION_PROFILES = ['configured', 'local_deterministic'] as const
export const SECURITY_GRADES = ['A', 'B', 'C', 'D'] as const
export const SECURITY_MODES = ['off', 'observe', 'warn', 'enforce'] as const
export const SECURITY_OVERRIDE_KINDS = ['warn_acknowledgement', 'accept_medium', 'temporary_high'] as const
export const SECURITY_REPORT_STATES = ['unassessed', 'passed', 'review_required', 'blocked', 'failed', 'stale'] as const
export const SECURITY_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export const SECURITY_SUBJECT_TYPES = ['skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt'] as const
export const SECURITY_TRIGGERS = ['manual', 'batch', 'publish_gate', 'retry'] as const
export const SECURITY_VERDICTS = ['passed', 'review_required', 'blocked'] as const
export const SECURITY_TRUST_DIMENSIONS = ['safety', 'reliability', 'applicability', 'maintainability', 'effectiveness'] as const
export const SECURITY_TRUST_RATINGS = ['exceptional', 'excellent', 'good', 'fair', 'poor'] as const

export type SecurityActiveScanStatus = Extract<SecurityAssessmentStatus, 'queued' | 'preparing' | 'running'>
export type SecurityAssessmentStatus = typeof SECURITY_ASSESSMENT_STATUSES[number]
export interface SecurityCoverage {
  included: string[]
  label: '完整静态评测' | '部分静态评测' | '仅配置评测'
  level: SecurityCoverageLevel
  partitions: Record<string, SecurityCoveragePartition>
  skipped: SecurityCoverageSkippedItem[]
  sourceRevision: string | null
}
export type SecurityCoverageLevel = typeof SECURITY_COVERAGE_LEVELS[number]
export interface SecurityCoveragePartition {
  includedCount: number
  skippedCount: number
  status: 'complete' | 'partial' | 'config_only' | 'metadata_only' | 'not_applicable'
}
export interface SecurityCoverageSkippedItem {
  reason: string
  ref: string
}
export interface SecurityDocumentEvaluation {
  dimensions: SecurityTrustDimension[]
  method: 'document_evidence'
  model: 'platform-document-rubric-v1'
  rating: SecurityTrustRating
  schemaVersion: 'document-evidence-v1'
  score: number
  summary: string
}
export type SecurityEffectiveReportState = Extract<SecurityReportState, 'passed' | 'review_required' | 'blocked'>
export interface SecurityEvidenceEvaluation {
  dimensions: []
  method: 'deterministic'
  model: string
  rating: null
  schemaVersion: 'security-evidence-v1'
  score: null
  summary: null
}
export type SecurityExecutionProfile = typeof SECURITY_EXECUTION_PROFILES[number]
export type SecurityGrade = typeof SECURITY_GRADES[number]
export interface SecurityHybridEvaluation {
  dimensions: SecurityTrustDimension[]
  method: 'hybrid'
  model: string
  rating: SecurityTrustRating
  schemaVersion: 'trusted-eval-v1'
  score: number
  summary: string
}

export type SecurityMode = typeof SECURITY_MODES[number]
export type SecurityOverrideKind = typeof SECURITY_OVERRIDE_KINDS[number]
export type SecurityPublicSubjectType = Extract<SecuritySubjectType, 'skill' | 'mcp' | 'prompt'>

export type SecurityReportState = typeof SECURITY_REPORT_STATES[number]

export interface SecurityRiskCounts {
  critical: number
  high: number
  info: number
  low: number
  medium: number
}

export interface SecurityScore {
  counts: SecurityRiskCounts
  grade: SecurityGrade
  highestSeverity: SecuritySeverity | null
  score: number
  verdict: SecurityVerdict
}

export type SecuritySeverity = typeof SECURITY_SEVERITIES[number]

export type SecuritySubjectType = typeof SECURITY_SUBJECT_TYPES[number]

export type SecurityTrigger = typeof SECURITY_TRIGGERS[number]

export interface SecurityTrustDimension {
  code: SecurityTrustDimensionCode
  evidence: string[]
  recommendations: string[]
  score: number
  source: 'ai_assisted' | 'deterministic'
  strengths: string[]
  summary: string
  weaknesses: string[]
}

export type SecurityTrustDimensionCode = typeof SECURITY_TRUST_DIMENSIONS[number]

export type SecurityTrustEvaluation = SecurityDocumentEvaluation | SecurityEvidenceEvaluation | SecurityHybridEvaluation

export type SecurityTrustRating = typeof SECURITY_TRUST_RATINGS[number]

export type SecurityVerdict = typeof SECURITY_VERDICTS[number]

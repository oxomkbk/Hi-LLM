import { strongestSecurityRiskDisposition } from './risk-disposition'
import { evaluatePublishGate } from './state-machine'

import type { SecurityMode, SecurityReportState, SecuritySeverity, SecuritySubjectType } from './domain'
import type { PublishGateReason } from './state-machine'
import type { PoolClient } from 'pg'

export interface AiContentPublishGateResult {
  allowed: boolean
  message: string
  reason: PublishGateReason
}

interface GateRow {
  assessed_declared_fingerprint: string | null
  assessed_input_fingerprint: string | null
  current_declared_fingerprint: string
  latest_assessment_id: string | null
  latest_attempt_id: string | null
  report_state: SecurityReportState
  scanner_config_fingerprint: string | null
  mode: SecurityMode
}

const PUBLISH_GATE_MESSAGES: Record<PublishGateReason, string> = {
  critical_risk: '检测到可能造成真实损害的严重危险，请整改或完成双人误报确认后重新发布',
  danger_review_required: '检测到可能执行危险操作的内容，请先处理危险项',
  mode_not_enforced: '当前评测模式不阻止发布',
  report_passed: '安全评测已通过',
  valid_report_required: '发布前需要完成一次与当前内容匹配的安全评测',
}

export async function evaluateAiContentPublishGate(
  client: PoolClient,
  contentType: 'mcp' | 'prompt' | 'skill',
  subject: { id: string, type: SecuritySubjectType } | null,
  expectedDeclaredFingerprint?: string,
): Promise<AiContentPublishGateResult> {
  if (subject && contentTypeForSubject(subject.type) !== contentType)
    throw new Error('安全评测主体与内容类型不匹配')
  const settings = await client.query<{ mode: SecurityMode }>(`
    select case $1
      when 'skill' then skill_mode
      when 'mcp' then mcp_mode
      when 'prompt' then prompt_mode
    end as mode
    from public.ds_ai_security_settings
    where id = true
  `, [contentType])
  const mode = settings.rows[0]?.mode
  if (!mode)
    return gateResult(false, 'valid_report_required')
  if (mode === 'off' || mode === 'observe' || mode === 'warn')
    return gateResult(true, 'mode_not_enforced')
  if (!subject)
    return gateResult(false, 'valid_report_required')

  const state = await client.query<GateRow>(`
    select state.assessed_declared_fingerprint,
           assessment.input_fingerprint as assessed_input_fingerprint,
           state.current_declared_fingerprint, state.latest_assessment_id,
           state.latest_attempt_id, state.report_state,
           state.scanner_config_fingerprint,
           case $3
             when 'skill' then settings.skill_mode
             when 'mcp' then settings.mcp_mode
             when 'prompt' then settings.prompt_mode
           end as mode
    from public.ds_ai_security_settings settings
    left join public.ds_ai_security_subject_states state
      on state.subject_type = $1 and state.subject_id = $2::uuid
    left join public.ds_ai_security_assessments assessment
      on assessment.id = state.latest_assessment_id
    where settings.id = true
    limit 1
  `, [subject.type, subject.id, contentType])
  const row = state.rows[0]
  if (!row || !row.latest_assessment_id || !row.scanner_config_fingerprint)
    return gateResult(false, 'valid_report_required')
  if (expectedDeclaredFingerprint && row.current_declared_fingerprint !== expectedDeclaredFingerprint)
    return gateResult(false, 'valid_report_required')
  if (row.assessed_declared_fingerprint !== row.current_declared_fingerprint)
    return gateResult(false, 'valid_report_required')

  const [findingResult, overrideResult] = await Promise.all([
    client.query<{ risk_code: string, severity: SecuritySeverity }>(`
      select finding.risk_code, finding.severity
      from public.ds_ai_security_findings finding
      where finding.assessment_id = $1::uuid
        and not exists (
          select 1
          from public.ds_ai_security_finding_reviews review
          where review.finding_id = finding.id
            and review.decision in ('false_positive', 'false_positive_approved')
            and not exists (
              select 1
              from public.ds_ai_security_finding_reviews reopened
              where reopened.review_of_id = review.id and reopened.decision = 'reopen'
            )
        )
    `, [row.latest_assessment_id]),
    client.query<{ kind: 'accept_medium' | 'temporary_high' | 'warn_acknowledgement' }>(`
      select kind
      from public.ds_ai_security_overrides
      where subject_type = $1 and subject_id = $2::uuid
        and assessment_id = $3::uuid
        and declared_fingerprint = $4
        and scanner_config_fingerprint = $5
        and input_fingerprint is not distinct from $6
        and revoked_at is null
        and (expires_at is null or expires_at > now())
        and (kind <> 'warn_acknowledgement' or basis_attempt_id = $7::uuid)
    `, [
      subject.type,
      subject.id,
      row.latest_assessment_id,
      row.current_declared_fingerprint,
      row.scanner_config_fingerprint,
      row.assessed_input_fingerprint,
      row.latest_attempt_id,
    ]),
  ])
  const overrides = new Set(overrideResult.rows.map(item => item.kind))
  const riskDisposition = findingResult.rows.length > 0
    ? strongestSecurityRiskDisposition(findingResult.rows.map(finding => ({
        riskCode: finding.risk_code,
        severity: finding.severity,
      })))
    : null
  const decision = evaluatePublishGate({
    hasTemporaryHigh: overrides.has('temporary_high'),
    mode: row.mode,
    reportState: row.report_state,
    riskDisposition,
  })
  return gateResult(decision.allowed, decision.reason)
}

export function evaluateSkillPublishGate(
  client: PoolClient,
  subject: { id: string, type: 'skill' | 'skill_submission' } | null,
  expectedDeclaredFingerprint?: string,
) {
  return evaluateAiContentPublishGate(client, 'skill', subject, expectedDeclaredFingerprint)
}

function contentTypeForSubject(type: SecuritySubjectType): 'mcp' | 'prompt' | 'skill' {
  if (type === 'mcp' || type === 'mcp_submission')
    return 'mcp'
  if (type === 'skill' || type === 'skill_submission')
    return 'skill'
  return 'prompt'
}

function gateResult(allowed: boolean, reason: PublishGateReason): AiContentPublishGateResult {
  return { allowed, message: PUBLISH_GATE_MESSAGES[reason], reason }
}

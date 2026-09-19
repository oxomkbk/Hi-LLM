import 'server-only'

import { ensureBusinessUser, withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'

import type { SecurityCapabilities } from './capabilities'
import type { SecurityOverrideKind, SecuritySeverity, SecuritySubjectType } from './domain'
import type { Actor } from '@/lib/repositories/catalog'
import type { PoolClient } from 'pg'

type AssessmentReviewAction = 'accept_medium' | 'revoke_override' | 'temporary_high'
type FindingReviewAction = 'approve_false_positive' | 'mark_false_positive' | 'propose_false_positive' | 'reopen'

interface ReviewTargetRow {
  assessment_id: string
  assessed_declared_fingerprint: string | null
  current_declared_fingerprint: string
  declared_fingerprint: string
  input_fingerprint: string | null
  latest_assessment_id: string | null
  report_state: string
  scanner_config_fingerprint: string
  state_scanner_config_fingerprint: string | null
  status: string
  subject_id: string
  subject_type: SecuritySubjectType
}

export class SecurityReviewServiceError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export async function resolveAssessmentReview(input: {
  action: AssessmentReviewAction
  actor: Actor
  assessmentId: string
  capabilities: SecurityCapabilities
  expiresAt?: string | null
  overrideId?: string | null
  reason: string
}) {
  return withBusinessTransaction(async (client) => {
    await ensureBusinessUser(input.actor, client)
    const target = await lockReviewTarget(client, input.assessmentId)
    const reason = reviewReason(input.reason)

    if (input.action === 'revoke_override') {
      const overrideId = requiredId(input.overrideId, '风险处置记录')
      const revoked = await client.query<{ id: string }>(`
        update public.ds_ai_security_overrides
        set revoked_at = now(), revoked_by = $3::uuid
        where id = $1::uuid and assessment_id = $2::uuid and revoked_at is null
        returning id
      `, [overrideId, input.assessmentId, input.actor.id])
      if (!revoked.rows[0])
        throw reviewError('风险处置不存在或已经撤销', 404, 'SECURITY_OVERRIDE_NOT_FOUND')
      await writeReviewAudit(client, {
        action: 'security.override.revoked',
        actorId: input.actor.id,
        assessmentId: input.assessmentId,
        code: 'SECURITY_OVERRIDE_REVOKED',
        metadata: { overrideId, reason },
      })
      return { action: input.action, id: overrideId }
    }

    ensureCurrentCompletedReport(target)
    const kind: SecurityOverrideKind = input.action === 'accept_medium' ? 'accept_medium' : 'temporary_high'
    if (kind === 'accept_medium') {
      if (!input.capabilities.canReviewLowMedium)
        throw reviewError('当前管理员没有处理中风险的权限', 403, 'SECURITY_REVIEW_FORBIDDEN')
      if (target.report_state !== 'review_required')
        throw reviewError('当前报告不需要中风险复核', 409, 'SECURITY_REVIEW_NOT_REQUIRED')
    }
    else {
      if (!input.capabilities.canCreateTemporaryHigh)
        throw reviewError('只有系统主管理员可以临时放行高风险', 403, 'SECURITY_REVIEW_FORBIDDEN')
      if (target.report_state !== 'blocked')
        throw reviewError('当前报告不是高风险阻断状态', 409, 'SECURITY_REVIEW_NOT_REQUIRED')
      const severity = await client.query<{ critical: string, high: string }>(`
        select
          count(*) filter (where severity = 'critical')::text as critical,
          count(*) filter (where severity = 'high')::text as high
        from public.ds_ai_security_findings
        where assessment_id = $1::uuid
      `, [input.assessmentId])
      if (Number(severity.rows[0]?.critical ?? 0) > 0)
        throw reviewError('严重风险不可临时放行，必须完成整改后重新评测', 409, 'SECURITY_CRITICAL_OVERRIDE_FORBIDDEN')
      if (Number(severity.rows[0]?.high ?? 0) === 0)
        throw reviewError('当前报告没有可临时放行的高风险', 409, 'SECURITY_REVIEW_NOT_REQUIRED')
    }

    const expiresAt = kind === 'temporary_high' ? temporaryExpiry(input.expiresAt) : null
    const existing = await client.query<{ id: string }>(`
      select id
      from public.ds_ai_security_overrides
      where subject_type = $1 and subject_id = $2::uuid
        and assessment_id = $3::uuid and kind = $4
        and declared_fingerprint = $5 and scanner_config_fingerprint = $6
        and revoked_at is null and (expires_at is null or expires_at > now())
      order by created_at desc
      limit 1
      for update
    `, [
      target.subject_type,
      target.subject_id,
      input.assessmentId,
      kind,
      target.declared_fingerprint,
      target.scanner_config_fingerprint,
    ])
    if (existing.rows[0])
      return { action: input.action, id: existing.rows[0].id, reused: true }

    const created = await client.query<{ id: string }>(`
      insert into public.ds_ai_security_overrides (
        subject_type, subject_id, assessment_id, basis_attempt_id, kind,
        reason, declared_fingerprint, input_fingerprint,
        scanner_config_fingerprint, created_by, expires_at
      ) values ($1, $2::uuid, $3::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10)
      returning id
    `, [
      target.subject_type,
      target.subject_id,
      input.assessmentId,
      kind,
      reason,
      target.declared_fingerprint,
      target.input_fingerprint,
      target.scanner_config_fingerprint,
      input.actor.id,
      expiresAt,
    ])
    await writeReviewAudit(client, {
      action: `security.override.${kind}`,
      actorId: input.actor.id,
      assessmentId: input.assessmentId,
      code: kind === 'accept_medium' ? 'SECURITY_MEDIUM_ACCEPTED' : 'SECURITY_HIGH_TEMPORARILY_ACCEPTED',
      metadata: { expiresAt, kind, reason },
    })
    return { action: input.action, id: created.rows[0]!.id, reused: false }
  })
}

export async function reviewAssessmentFinding(input: {
  action: FindingReviewAction
  actor: Actor
  assessmentId: string
  capabilities: SecurityCapabilities
  findingId: string
  reason: string
  reviewOfId?: string | null
}) {
  return withBusinessTransaction(async (client) => {
    await ensureBusinessUser(input.actor, client)
    const target = await lockReviewTarget(client, input.assessmentId)
    ensureCurrentCompletedReport(target)
    const finding = await client.query<{ severity: SecuritySeverity }>(`
      select severity
      from public.ds_ai_security_findings
      where id = $1::uuid and assessment_id = $2::uuid
      for update
    `, [input.findingId, input.assessmentId])
    const severity = finding.rows[0]?.severity
    if (!severity)
      throw reviewError('风险项不存在', 404, 'SECURITY_FINDING_NOT_FOUND')
    const reason = reviewReason(input.reason)
    const reviewOfId = input.reviewOfId ? requiredId(input.reviewOfId, '复核记录') : null

    const decision = await findingDecision(client, {
      action: input.action,
      actorId: input.actor.id,
      assessmentId: input.assessmentId,
      capabilities: input.capabilities,
      findingId: input.findingId,
      reviewOfId,
      severity,
    })
    const created = await client.query<{ id: string }>(`
      insert into public.ds_ai_security_finding_reviews (
        finding_id, assessment_id, decision, review_of_id, reason, created_by
      ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::uuid)
      returning id
    `, [input.findingId, input.assessmentId, decision, reviewOfId, reason, input.actor.id])
    await writeReviewAudit(client, {
      action: `security.finding.${decision}`,
      actorId: input.actor.id,
      assessmentId: input.assessmentId,
      code: `SECURITY_FINDING_${decision.toUpperCase()}`,
      metadata: { findingId: input.findingId, reason, reviewOfId, severity },
    })
    return { decision, id: created.rows[0]!.id }
  })
}

function ensureCurrentCompletedReport(target: ReviewTargetRow) {
  if (target.status !== 'completed')
    throw reviewError('只有已完成的评测报告可以复核', 409, 'SECURITY_INVALID_STATE_TRANSITION')
  if (target.latest_assessment_id !== target.assessment_id
    || target.assessed_declared_fingerprint !== target.current_declared_fingerprint
    || target.declared_fingerprint !== target.current_declared_fingerprint
    || target.state_scanner_config_fingerprint !== target.scanner_config_fingerprint) {
    throw reviewError('该报告已过期，请先完成一次针对当前内容的评测', 409, 'SECURITY_REPORT_STALE')
  }
}

async function ensureNoOpenFindingDecision(client: PoolClient, findingId: string) {
  const result = await client.query<{ exists: boolean }>(`
    select exists (
      select 1
      from public.ds_ai_security_finding_reviews review
      where review.finding_id = $1::uuid
        and (
          (
            review.decision in ('false_positive', 'false_positive_approved')
            and not exists (
              select 1 from public.ds_ai_security_finding_reviews reopened
              where reopened.review_of_id = review.id and reopened.decision = 'reopen'
            )
          )
          or
          (
            review.decision = 'false_positive_proposed'
            and not exists (
              select 1 from public.ds_ai_security_finding_reviews approval
              where approval.review_of_id = review.id
                and approval.decision = 'false_positive_approved'
            )
          )
        )
    ) as exists
  `, [findingId])
  if (result.rows[0]?.exists)
    throw reviewError('该风险项已有生效或待批准的复核记录', 409, 'SECURITY_REVIEW_ALREADY_EXISTS')
}

async function findingDecision(client: PoolClient, input: {
  action: FindingReviewAction
  actorId: string
  assessmentId: string
  capabilities: SecurityCapabilities
  findingId: string
  reviewOfId: string | null
  severity: SecuritySeverity
}) {
  const elevated = input.severity === 'critical' || input.severity === 'high'
  if (!input.capabilities.canReviewLowMedium)
    throw reviewError('当前管理员没有风险复核权限', 403, 'SECURITY_REVIEW_FORBIDDEN')

  if (input.action === 'mark_false_positive') {
    if (elevated)
      throw reviewError('高危或严重风险必须先提议，再由另一位主管理员批准', 409, 'SECURITY_SECOND_REVIEW_REQUIRED')
    await ensureNoOpenFindingDecision(client, input.findingId)
    return 'false_positive' as const
  }
  if (input.action === 'propose_false_positive') {
    if (!elevated)
      throw reviewError('中低风险可直接标记误报，无需二次复核', 409, 'SECURITY_SECOND_REVIEW_NOT_REQUIRED')
    await ensureNoOpenFindingDecision(client, input.findingId)
    return 'false_positive_proposed' as const
  }

  const source = await client.query<{ created_by: string, decision: string }>(`
    select created_by, decision
    from public.ds_ai_security_finding_reviews
    where id = $1::uuid and finding_id = $2::uuid and assessment_id = $3::uuid
    for update
  `, [input.reviewOfId, input.findingId, input.assessmentId])
  const sourceReview = source.rows[0]
  if (!sourceReview)
    throw reviewError('关联的复核记录不存在', 404, 'SECURITY_REVIEW_NOT_FOUND')

  if (input.action === 'approve_false_positive') {
    if (!input.capabilities.canApproveHighCritical)
      throw reviewError('只有系统主管理员可以批准高危误报', 403, 'SECURITY_REVIEW_FORBIDDEN')
    if (sourceReview.decision !== 'false_positive_proposed')
      throw reviewError('只有待二次复核的提议可以批准', 409, 'SECURITY_INVALID_STATE_TRANSITION')
    if (sourceReview.created_by === input.actorId)
      throw reviewError('高危误报必须由另一位管理员复核', 409, 'SECURITY_SECOND_REVIEW_REQUIRED')
    return 'false_positive_approved' as const
  }

  if (!['false_positive', 'false_positive_approved'].includes(sourceReview.decision))
    throw reviewError('当前复核记录不能重新打开', 409, 'SECURITY_INVALID_STATE_TRANSITION')
  if (elevated && !input.capabilities.canApproveHighCritical)
    throw reviewError('只有系统主管理员可以重新打开高危风险', 403, 'SECURITY_REVIEW_FORBIDDEN')
  return 'reopen' as const
}

async function lockReviewTarget(client: PoolClient, assessmentId: string) {
  const result = await client.query<ReviewTargetRow>(`
    select assessment.id as assessment_id, assessment.status,
           assessment.subject_type, assessment.subject_id,
           assessment.declared_fingerprint, assessment.input_fingerprint,
           assessment.scanner_config_fingerprint,
           state.latest_assessment_id, state.report_state,
           state.assessed_declared_fingerprint, state.current_declared_fingerprint,
           state.scanner_config_fingerprint as state_scanner_config_fingerprint
    from public.ds_ai_security_assessments assessment
    join public.ds_ai_security_subject_states state
      on state.subject_type = assessment.subject_type and state.subject_id = assessment.subject_id
    where assessment.id = $1::uuid
    for update of assessment, state
  `, [assessmentId])
  if (!result.rows[0])
    throw reviewError('评测报告不存在', 404, 'SECURITY_ASSESSMENT_NOT_FOUND')
  return result.rows[0]
}

function requiredId(value: string | null | undefined, label: string) {
  const normalized = value?.normalize('NFC').trim() ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized))
    throw reviewError(`${label}无效`, 400, 'SECURITY_REQUEST_INVALID')
  return normalized
}

function reviewError(message: string, status: number, code: string) {
  return new SecurityReviewServiceError(message, status, code)
}

function reviewReason(value: string) {
  const normalized = value.normalize('NFC').trim()
  if (normalized.length < 10 || normalized.length > 2000)
    throw reviewError('请填写 10–2000 字的复核理由', 400, 'SECURITY_REVIEW_REASON_INVALID')
  return normalized
}

function temporaryExpiry(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const maximum = Date.now() + 30 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || date.getTime() > maximum)
    throw reviewError('临时放行有效期必须在未来 30 天内', 400, 'SECURITY_OVERRIDE_EXPIRY_INVALID')
  return date
}

async function writeReviewAudit(client: PoolClient, input: {
  action: string
  actorId: string
  assessmentId: string
  code: string
  metadata: Record<string, unknown>
}) {
  await enqueueSecurityAudit(client, {
    action: input.action,
    actorUserId: input.actorId,
    code: input.code,
    metadata: input.metadata,
    resourceId: input.assessmentId,
    resourceType: 'security_assessment',
    success: true,
  })
}

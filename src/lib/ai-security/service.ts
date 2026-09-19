import 'server-only'

import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'
import { deleteFileObject } from '@/lib/files/service'

import { enqueueSecurityAudit } from './audit-outbox'
import { securityRiskDisposition } from './risk-disposition'
import { getSecurityWorkerRuntime } from './worker-runtime'

import type { SecurityAssessmentStatus, SecurityReportState, SecuritySubjectType } from './domain'
import type { Actor } from '@/lib/repositories/catalog'

export interface SecurityAssessmentFilters {
  pageIndex: number
  pageSize: number
  q?: string
  reportState?: SecurityReportState
  status?: SecurityAssessmentStatus
  subjectType?: SecuritySubjectType
}

interface AssessmentFindingRow {
  [key: string]: unknown
  risk_code: string
  severity: 'critical' | 'high' | 'info' | 'low' | 'medium'
}

interface AssessmentListRow {
  attempt_number: number
  batch_id: string | null
  coverage: Record<string, unknown> | null
  created_at: Date
  finished_at: Date | null
  evaluation_method: string | null
  execution_profile: 'configured' | 'local_deterministic'
  grade: string | null
  id: string
  next_run_at: Date
  original_critical_count: number
  original_high_count: number
  original_info_count: number
  original_low_count: number
  original_medium_count: number
  original_score: number | null
  quality_rating: string | null
  quality_score: number | null
  report_state: SecurityReportState | null
  source_revision: string | null
  started_at: Date | null
  status: SecurityAssessmentStatus
  subject_id: string
  subject_name_snapshot: string
  subject_slug_snapshot: string | null
  subject_type: SecuritySubjectType
  trigger: string
  worker_id: string | null
}

export class SecurityAssessmentServiceError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'SECURITY_REQUEST_INVALID') {
    super(message)
  }
}

export async function deleteAssessmentReport(id: string, actor: Actor) {
  const result = await withBusinessTransaction(async (client) => {
    await ensureBusinessUser(actor, client)
    const selected = await client.query<{
      retry_root_id: string
      subject_id: string
      subject_type: SecuritySubjectType
    }>(`
      select retry_root_id, subject_type, subject_id
      from public.ds_ai_security_assessments
      where id = $1::uuid
      for update
    `, [id])
    const target = selected.rows[0]
    if (!target)
      throw new SecurityAssessmentServiceError('评测任务不存在', 404, 'SECURITY_ASSESSMENT_NOT_FOUND')

    const chain = await client.query<{
      attempt_number: number
      id: string
      raw_report_file_id: string | null
      status: SecurityAssessmentStatus
    }>(`
      select id, status, attempt_number, raw_report_file_id
      from public.ds_ai_security_assessments
      where retry_root_id = $1::uuid
      order by attempt_number desc, created_at desc
      for update
    `, [target.retry_root_id])
    if (chain.rows.some(item => ['queued', 'preparing', 'running'].includes(item.status))) {
      throw new SecurityAssessmentServiceError(
        '正在执行或排队的评测不能删除，请先取消任务',
        409,
        'SECURITY_ASSESSMENT_ACTIVE',
      )
    }
    const chainIds = chain.rows.map(item => item.id)

    await client.query(`
      update public.ds_ai_security_subject_states
      set latest_assessment_id = case when latest_assessment_id = any($1::uuid[]) then null else latest_assessment_id end,
          latest_attempt_id = case
            when latest_attempt_id = any($1::uuid[]) and latest_assessment_id <> all($1::uuid[]) then latest_assessment_id
            when latest_attempt_id = any($1::uuid[]) then null
            else latest_attempt_id
          end,
          active_assessment_id = case when active_assessment_id = any($1::uuid[]) then null else active_assessment_id end,
          assessed_declared_fingerprint = case when latest_assessment_id = any($1::uuid[]) then null else assessed_declared_fingerprint end,
          assessed_source_revision = case when latest_assessment_id = any($1::uuid[]) then null else assessed_source_revision end,
          scanner_config_fingerprint = case when latest_assessment_id = any($1::uuid[]) then null else scanner_config_fingerprint end,
          report_state = case when latest_assessment_id = any($1::uuid[]) then 'unassessed' else report_state end,
          score = case when latest_assessment_id = any($1::uuid[]) then null else score end,
          grade = case when latest_assessment_id = any($1::uuid[]) then null else grade end,
          verdict = case when latest_assessment_id = any($1::uuid[]) then null else verdict end,
          critical_count = case when latest_assessment_id = any($1::uuid[]) then 0 else critical_count end,
          high_count = case when latest_assessment_id = any($1::uuid[]) then 0 else high_count end,
          medium_count = case when latest_assessment_id = any($1::uuid[]) then 0 else medium_count end,
          low_count = case when latest_assessment_id = any($1::uuid[]) then 0 else low_count end,
          info_count = case when latest_assessment_id = any($1::uuid[]) then 0 else info_count end,
          fresh_until = case when latest_assessment_id = any($1::uuid[]) then null else fresh_until end,
          assessed_at = case when latest_assessment_id = any($1::uuid[]) then null else assessed_at end,
          stale_at = case when latest_assessment_id = any($1::uuid[]) then null else stale_at end,
          row_version = row_version + 1
      where (
          latest_assessment_id = any($1::uuid[])
          or latest_attempt_id = any($1::uuid[])
          or active_assessment_id = any($1::uuid[])
        )
    `, [chainIds])

    await client.query(`
      delete from public.ds_ai_security_overrides
      where assessment_id = any($1::uuid[]) or basis_attempt_id = any($1::uuid[])
    `, [chainIds])
    await enqueueSecurityAudit(client, {
      action: 'security.assessment.delete',
      actorUserId: actor.id,
      code: 'SECURITY_ASSESSMENT_DELETED',
      metadata: {
        assessmentIds: chainIds,
        preservedSubject: true,
        subjectId: target.subject_id,
        subjectType: target.subject_type,
      },
      resourceId: target.retry_root_id,
      resourceType: 'security_assessment',
      success: true,
    })
    for (const assessment of chain.rows)
      await client.query('delete from public.ds_ai_security_assessments where id = $1::uuid', [assessment.id])

    return {
      deletedCount: chainIds.length,
      fileIds: chain.rows.flatMap(item => item.raw_report_file_id ? [item.raw_report_file_id] : []),
      subjectId: target.subject_id,
      subjectType: target.subject_type,
    }
  })

  await Promise.allSettled(result.fileIds.map(fileId => deleteFileObject(fileId)))
  return {
    deletedCount: result.deletedCount,
    subjectId: result.subjectId,
    subjectType: result.subjectType,
  }
}

export async function getAdminAssessmentDetail(id: string) {
  const [assessmentResult, dimensionsResult, findingsResult, historyResult, currentReportResult, overridesResult] = await Promise.all([
    queryBusiness(`
      select assessment.id, assessment.subject_type, assessment.subject_id,
             assessment.subject_name_snapshot, assessment.subject_slug_snapshot,
             assessment.trigger, assessment.status, assessment.declared_fingerprint,
             assessment.input_fingerprint, assessment.scanner_config_fingerprint,
             assessment.scanner_name, assessment.scanner_version, assessment.rules_version,
             assessment.source_revision, assessment.coverage, assessment.engine_score,
             assessment.original_score, assessment.original_grade, assessment.original_verdict,
             assessment.original_critical_count, assessment.original_high_count,
             assessment.original_medium_count, assessment.original_low_count,
             assessment.original_info_count, assessment.summary,
             assessment.quality_score::float8, assessment.quality_rating,
             assessment.evaluation_summary, assessment.evaluation_schema_version,
             assessment.evaluation_method, assessment.evaluation_model,
             assessment.raw_report_file_id is not null as raw_report_available,
             assessment.attempt_number,
             (select max_attempts from public.ds_ai_security_settings where id = true) as max_attempts,
             assessment.error_code, assessment.error_message,
             assessment.cancel_requested_at, assessment.created_at, assessment.started_at,
             assessment.finished_at,
             state.report_state, state.score as effective_score, state.grade as effective_grade,
             state.verdict as effective_verdict, state.fresh_until, state.assessed_at,
             state.active_assessment_id = assessment.id as is_active,
             state.latest_assessment_id = assessment.id as is_current
      from public.ds_ai_security_assessments assessment
      left join public.ds_ai_security_subject_states state
        on state.subject_type = assessment.subject_type and state.subject_id = assessment.subject_id
      where assessment.id = $1::uuid
      limit 1
    `, [id]),
    queryBusiness(`
      select dimension, score::float8, summary, strengths, weaknesses,
             recommendations, evidence, source, display_order
      from public.ds_ai_security_dimension_scores
      where assessment_id = $1::uuid
      order by display_order
    `, [id]),
    queryBusiness<AssessmentFindingRow>(`
      select finding.id, finding.risk_code, finding.severity, finding.title,
             finding.description, finding.recommendation, finding.artifact_path,
             finding.start_line, finding.end_line, finding.evidence_redacted,
             finding.public_summary, finding.public_visible, finding.finding_fingerprint,
             coalesce(jsonb_agg(jsonb_build_object(
               'id', review.id, 'decision', review.decision, 'reason', review.reason,
               'createdBy', review.created_by, 'createdAt', review.created_at,
               'reviewOfId', review.review_of_id
             ) order by review.created_at, review.id) filter (where review.id is not null), '[]'::jsonb) as reviews
      from public.ds_ai_security_findings finding
      left join public.ds_ai_security_finding_reviews review on review.finding_id = finding.id
      where finding.assessment_id = $1::uuid
      group by finding.id
      order by case finding.severity
        when 'critical' then 1 when 'high' then 2 when 'medium' then 3 when 'low' then 4 else 5 end,
        finding.created_at, finding.id
    `, [id]),
    queryBusiness(`
      select id, status, attempt_number, original_score, original_grade,
             error_code, created_at, started_at, finished_at
      from public.ds_ai_security_assessments
      where retry_root_id = (
        select retry_root_id from public.ds_ai_security_assessments where id = $1::uuid
      )
      order by attempt_number, created_at
      limit 20
    `, [id]),
    queryBusiness(`
      select current_report.id, current_report.status,
             current_report.original_score, current_report.original_grade,
             current_report.original_verdict, current_report.quality_score::float8,
             current_report.quality_rating, current_report.evaluation_summary,
             current_report.summary, current_report.finished_at,
             state.report_state,
             state.latest_attempt_id,
             latest_attempt.status as latest_attempt_status,
             latest_attempt.error_code as latest_attempt_error_code,
             latest_attempt.error_message as latest_attempt_error_message
      from public.ds_ai_security_assessments selected
      join public.ds_ai_security_subject_states state
        on state.subject_type = selected.subject_type and state.subject_id = selected.subject_id
      left join public.ds_ai_security_assessments current_report
        on current_report.id = state.latest_assessment_id
      left join public.ds_ai_security_assessments latest_attempt
        on latest_attempt.id = state.latest_attempt_id
      where selected.id = $1::uuid
      limit 1
    `, [id]),
    queryBusiness(`
      select override.id, override.kind, override.reason, override.created_by,
             override.created_at, override.expires_at, override.revoked_at,
             override.revoked_by,
             coalesce(author.display_name, author.email) as created_by_name,
             coalesce(revoker.display_name, revoker.email) as revoked_by_name
      from public.ds_ai_security_overrides override
      left join public.app_users author on author.id = override.created_by
      left join public.app_users revoker on revoker.id = override.revoked_by
      where override.assessment_id = $1::uuid
      order by override.created_at desc, override.id desc
    `, [id]),
  ])
  const assessment = assessmentResult.rows[0]
  if (!assessment)
    throw new SecurityAssessmentServiceError('评测任务不存在', 404, 'SECURITY_ASSESSMENT_NOT_FOUND')
  return {
    assessment: serializeDates(assessment),
    currentReport: currentReportResult.rows[0] ? serializeDates(currentReportResult.rows[0]) : null,
    dimensions: dimensionsResult.rows.map(serializeDates),
    findings: findingsResult.rows.map(row => ({
      ...serializeDates(row),
      disposition: securityRiskDisposition({ riskCode: row.risk_code, severity: row.severity }),
    })),
    history: historyResult.rows.map(serializeDates),
    overrides: overridesResult.rows.map(serializeDates),
  }
}

export async function getRawAssessmentReportFile(id: string) {
  const result = await queryBusiness<{
    id: string
    mime_type: string
    object_key: string
    original_name: string
    size_bytes: string
    status: string
    storage_profile_id: string
  }>(`
    select file.id, file.mime_type, file.object_key, file.original_name,
           file.size_bytes, file.status, file.storage_profile_id
    from public.ds_ai_security_assessments assessment
    join public.file_objects file on file.id = assessment.raw_report_file_id
    where assessment.id = $1::uuid and file.visibility = 'private'
    limit 1
  `, [id])
  const file = result.rows[0]
  if (!file || file.status !== 'ready')
    throw new SecurityAssessmentServiceError('原始报告不存在', 404, 'SECURITY_REPORT_NOT_FOUND')
  return file
}

export async function listAdminAssessments(filters: SecurityAssessmentFilters) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }
  if (filters.subjectType)
    add(value => `assessment.subject_type = ${value}`, filters.subjectType)
  if (filters.status)
    add(value => `assessment.status = ${value}`, filters.status)
  if (filters.reportState)
    add(value => `state.report_state = ${value}`, filters.reportState)
  if (filters.q)
    add(value => `(assessment.subject_name_snapshot ilike ${value} or coalesce(assessment.subject_slug_snapshot, '') ilike ${value})`, `%${escapeLike(filters.q)}%`)
  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const countValues = [...values]
  values.push(filters.pageSize, filters.pageIndex * filters.pageSize)

  const [count, list, summary, runtime] = await Promise.all([
    queryBusiness<{ total: string }>(`
      select count(*)::text as total
      from public.ds_ai_security_assessments assessment
      left join public.ds_ai_security_subject_states state
        on state.subject_type = assessment.subject_type and state.subject_id = assessment.subject_id
      ${where}
    `, countValues),
    queryBusiness<AssessmentListRow>(`
      select assessment.id, assessment.subject_type, assessment.subject_id,
             assessment.subject_name_snapshot, assessment.subject_slug_snapshot,
             assessment.trigger, assessment.status, assessment.attempt_number,
             assessment.execution_profile, assessment.batch_id,
             assessment.source_revision, assessment.coverage, assessment.original_score,
             assessment.quality_score::float8, assessment.quality_rating,
             assessment.evaluation_method,
             assessment.original_critical_count, assessment.original_high_count,
             assessment.original_medium_count, assessment.original_low_count,
             assessment.original_info_count, assessment.created_at,
             assessment.started_at, assessment.finished_at, assessment.next_run_at,
             assessment.worker_id,
             case
               when assessment.status = 'completed' then assessment.original_verdict::text
               when assessment.status = 'failed' then 'failed'
               when assessment.status = 'cancelled' then 'unassessed'
               else null
             end as report_state,
             assessment.original_grade as grade
      from public.ds_ai_security_assessments assessment
      left join public.ds_ai_security_subject_states state
        on state.subject_type = assessment.subject_type and state.subject_id = assessment.subject_id
      ${where}
      order by assessment.created_at desc, assessment.id desc
      limit $${values.length - 1} offset $${values.length}
    `, values),
    queryBusiness<{
      active: string
      blocked: string
      failed: string
      passed: string
      review_required: string
      unassessed: string
    }>(`
      select
        count(*) filter (where status in ('queued', 'preparing', 'running'))::text as active,
        count(*) filter (where status = 'completed' and original_verdict = 'blocked')::text as blocked,
        count(*) filter (where status = 'failed')::text as failed,
        count(*) filter (where status = 'completed' and original_verdict = 'passed')::text as passed,
        count(*) filter (where status = 'completed' and original_verdict = 'review_required')::text as review_required,
        count(*) filter (where status = 'cancelled')::text as unassessed
      from public.ds_ai_security_assessments
    `),
    getSecurityWorkerRuntime(),
  ])
  const totals = summary.rows[0]
  return {
    list: list.rows.map(row => serializeDates(row)),
    page: filters.pageIndex + 1,
    pageSize: filters.pageSize,
    runtime,
    summary: {
      active: Number(totals?.active ?? 0),
      blocked: Number(totals?.blocked ?? 0),
      failed: Number(totals?.failed ?? 0),
      passed: Number(totals?.passed ?? 0),
      reviewRequired: Number(totals?.review_required ?? 0),
      unassessed: Number(totals?.unassessed ?? 0),
    },
    total: Number(count.rows[0]?.total ?? 0),
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

function serializeDates<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]))
}

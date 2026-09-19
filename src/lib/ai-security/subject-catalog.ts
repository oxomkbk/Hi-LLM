import 'server-only'

import { queryBusiness } from '@/lib/db/business'

import { getSecurityWorkerRuntime } from './worker-runtime'

import type { SecurityCapabilities } from './capabilities'
import type { SecurityReportState, SecuritySubjectType } from './domain'
import type { SecurityWorkerRuntime } from './worker-runtime'

export interface SecuritySubjectCatalogFilters {
  contentStatus?: string
  ignored?: boolean
  pageIndex: number
  pageSize: number
  q?: string
  reportState?: SecurityReportState
  subjectType?: SecuritySubjectType
}

export interface SecuritySubjectCatalogItem {
  activeCreatedAt: null | string
  activeAssessmentId: null | string
  activeNextRunAt: null | string
  activeStartedAt: null | string
  activeWorkerId: null | string
  adapterAvailable: boolean
  contentStatus: string
  grade: null | string
  historicalGrade: null | string
  historicalScore: null | number
  id: string
  ignoredAt: null | string
  ignoreReason: null | string
  latestAssessmentId: null | string
  latestAttemptId: null | string
  latestAttemptNumber: null | number
  latestAttemptStatus: null | string
  mode: string
  maxAttempts: number
  name: string
  reportState: SecurityReportState
  reviewResolved: boolean
  riskCounts: {
    critical: number
    high: number
    info: number
    low: number
    medium: number
  }
  scanStatus: null | string
  score: null | number
  slug: null | string
  subjectType: SecuritySubjectType
  updatedAt: string
}

interface CatalogRow {
  active_created_at: Date | null
  active_assessment_id: null | string
  active_next_run_at: Date | null
  active_started_at: Date | null
  active_worker_id: null | string
  adapter_available: boolean
  content_status: string
  critical_count: number
  grade: null | string
  historical_grade: null | string
  historical_score: null | number
  high_count: number
  id: string
  ignored_at: Date | null
  ignore_reason: null | string
  info_count: number
  latest_assessment_id: null | string
  latest_attempt_id: null | string
  latest_attempt_number: null | number
  latest_attempt_status: null | string
  low_count: number
  medium_count: number
  mode: string
  max_attempts: number
  name: string
  report_state: SecurityReportState
  review_resolved: boolean
  scan_status: null | string
  score: null | number
  slug: null | string
  subject_type: SecuritySubjectType
  updated_at: Date
}

const SUBJECT_CTE = `
  with subjects as (
    select 'skill'::text as subject_type, skill.id, skill.name, skill.slug,
           skill.status as content_status, skill.updated_at
    from public.ds_skills skill
    union all
    select 'skill_submission'::text, submission.id, submission.name,
           submission.slug, submission.status, submission.updated_at
    from public.ds_skill_submissions submission
    where submission.status <> 'approved'
      and not exists (
        select 1 from public.ds_skills skill
        where skill.origin_submission_id = submission.id
           or skill.id = submission.security_target_id
      )
    union all
    select 'mcp'::text, mcp.id, mcp.name, mcp.slug, mcp.status, mcp.updated_at
    from public.ds_mcps mcp
    union all
    select 'mcp_submission'::text, submission.id, submission.name,
           submission.slug, submission.status, submission.updated_at
    from public.ds_mcp_submissions submission
    where submission.status <> 'approved'
      and not exists (
        select 1 from public.ds_mcps mcp
        where mcp.origin_submission_id = submission.id
           or mcp.id = submission.security_target_id
           or mcp.id = submission.approved_mcp_id
      )
    union all
    select 'prompt'::text, id, title, slug, status, updated_at
    from public.ds_prompts
  ), catalog as (
    select subjects.*,
           coalesce(state.report_state, 'unassessed') as report_state,
           state.score, state.grade, state.ignored_at, state.ignore_reason,
           coalesce(state.critical_count, 0) as critical_count,
           coalesce(state.high_count, 0) as high_count,
           coalesce(state.medium_count, 0) as medium_count,
           coalesce(state.low_count, 0) as low_count,
           coalesce(state.info_count, 0) as info_count,
           state.active_assessment_id, state.latest_assessment_id, state.latest_attempt_id,
           active.status as scan_status,
           active.created_at as active_created_at,
           active.started_at as active_started_at,
           active.next_run_at as active_next_run_at,
           active.worker_id as active_worker_id,
           latest_attempt.status as latest_attempt_status,
           latest_attempt.attempt_number as latest_attempt_number,
           latest_report.original_score as historical_score,
           latest_report.original_grade as historical_grade,
           settings.max_attempts,
           (
             exists (
               select 1
               from public.ds_ai_security_overrides review_override
               where review_override.subject_type = subjects.subject_type
                 and review_override.subject_id = subjects.id
                 and review_override.assessment_id = state.latest_assessment_id
                 and review_override.kind in ('accept_medium', 'temporary_high')
                 and review_override.declared_fingerprint = state.current_declared_fingerprint
                 and review_override.scanner_config_fingerprint = state.scanner_config_fingerprint
                 and review_override.revoked_at is null
                 and (review_override.expires_at is null or review_override.expires_at > now())
             )
             or (
               state.report_state in ('review_required', 'blocked')
               and exists (
                 select 1
                 from public.ds_ai_security_findings finding
                 where finding.assessment_id = state.latest_assessment_id
                   and finding.severity = any(
                     case state.report_state
                       when 'blocked' then array['critical', 'high']::text[]
                       else array['critical', 'high', 'medium']::text[]
                     end
                   )
               )
               and not exists (
                 select 1
                 from public.ds_ai_security_findings finding
                 where finding.assessment_id = state.latest_assessment_id
                   and finding.severity = any(
                     case state.report_state
                       when 'blocked' then array['critical', 'high']::text[]
                       else array['critical', 'high', 'medium']::text[]
                     end
                   )
                   and not exists (
                     select 1
                     from public.ds_ai_security_finding_reviews finding_review
                     where finding_review.finding_id = finding.id
                       and finding_review.decision in ('false_positive', 'false_positive_approved')
                       and not exists (
                         select 1
                         from public.ds_ai_security_finding_reviews reopened
                         where reopened.review_of_id = finding_review.id
                           and reopened.decision = 'reopen'
                       )
                   )
               )
             )
           ) as review_resolved,
           case
             when subjects.subject_type in ('skill', 'skill_submission') then settings.skill_mode
             when subjects.subject_type in ('mcp', 'mcp_submission') then settings.mcp_mode
             else settings.prompt_mode
           end as mode,
           settings.adapter_versions ? case
             when subjects.subject_type in ('skill', 'skill_submission') then 'skill'
             when subjects.subject_type in ('mcp', 'mcp_submission') then 'mcp'
             else 'prompt'
           end as adapter_available
    from subjects
    cross join public.ds_ai_security_settings settings
    left join public.ds_ai_security_subject_states state
      on state.subject_type = subjects.subject_type and state.subject_id = subjects.id
    left join public.ds_ai_security_assessments active on active.id = state.active_assessment_id
    left join public.ds_ai_security_assessments latest_attempt on latest_attempt.id = state.latest_attempt_id
    left join public.ds_ai_security_assessments latest_report on latest_report.id = state.latest_assessment_id
    where settings.id = true
  )
`

export async function listAdminSecuritySubjects(
  filters: SecuritySubjectCatalogFilters,
  capabilities: SecurityCapabilities,
) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (sql: (placeholder: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(sql(`$${values.length}`))
  }
  if (filters.subjectType)
    add(placeholder => `subject_type = ${placeholder}`, filters.subjectType)
  if (filters.contentStatus)
    add(placeholder => `content_status = ${placeholder}`, filters.contentStatus)
  if (filters.reportState) {
    add(
      placeholder => filters.reportState === 'review_required'
        ? `(report_state = ${placeholder} and not review_resolved)`
        : `report_state = ${placeholder}`,
      filters.reportState,
    )
  }
  if (filters.ignored !== undefined)
    conditions.push(filters.ignored ? 'ignored_at is not null' : 'ignored_at is null')
  if (filters.q)
    add(placeholder => `(name ilike ${placeholder} or coalesce(slug, '') ilike ${placeholder})`, `%${escapeLike(filters.q)}%`)
  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const countValues = [...values]
  values.push(filters.pageSize, filters.pageIndex * filters.pageSize)

  const [rows, summary, runtime] = await Promise.all([
    queryBusiness<CatalogRow>(`${SUBJECT_CTE}
      select * from catalog
      ${where}
      order by
        (active_assessment_id is not null) desc,
        case report_state
          when 'blocked' then 1 when 'review_required' then 2 when 'failed' then 3
          when 'stale' then 4 when 'unassessed' then 5 when 'passed' then 6 else 7
        end,
        updated_at desc, subject_type, id
      limit $${values.length - 1} offset $${values.length}
    `, values),
    queryBusiness<{
      active: string
      blocked: string
      failed: string
      needs_assessment: string
      passed: string
      review_required: string
      review_resolved: string
      total: string
    }>(`${SUBJECT_CTE}
      select count(*)::text as total,
             count(*) filter (where active_assessment_id is not null)::text as active,
             count(*) filter (where report_state = 'passed')::text as passed,
             count(*) filter (where report_state = 'review_required' and not review_resolved)::text as review_required,
             count(*) filter (where report_state = 'review_required' and review_resolved)::text as review_resolved,
             count(*) filter (where report_state = 'blocked')::text as blocked,
             count(*) filter (where report_state = 'failed')::text as failed,
             count(*) filter (where report_state in ('unassessed', 'stale'))::text as needs_assessment
      from catalog
      ${where}
    `, countValues),
    getSecurityWorkerRuntime(),
  ])
  const totals = summary.rows[0]
  return {
    capabilities,
    list: rows.rows.map(projectCatalogRow),
    page: filters.pageIndex + 1,
    pageSize: filters.pageSize,
    runtime: runtime satisfies SecurityWorkerRuntime,
    summary: {
      active: Number(totals?.active ?? 0),
      blocked: Number(totals?.blocked ?? 0),
      failed: Number(totals?.failed ?? 0),
      needsAssessment: Number(totals?.needs_assessment ?? 0),
      passed: Number(totals?.passed ?? 0),
      reviewRequired: Number(totals?.review_required ?? 0),
      reviewResolved: Number(totals?.review_resolved ?? 0),
      total: Number(totals?.total ?? 0),
    },
    total: Number(totals?.total ?? 0),
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

function projectCatalogRow(row: CatalogRow): SecuritySubjectCatalogItem {
  return {
    activeCreatedAt: row.active_created_at?.toISOString() ?? null,
    activeAssessmentId: row.active_assessment_id,
    activeNextRunAt: row.active_next_run_at?.toISOString() ?? null,
    activeStartedAt: row.active_started_at?.toISOString() ?? null,
    activeWorkerId: row.active_worker_id,
    adapterAvailable: row.adapter_available,
    contentStatus: row.content_status,
    grade: row.grade,
    historicalGrade: row.historical_grade,
    historicalScore: row.historical_score,
    id: row.id,
    ignoredAt: row.ignored_at?.toISOString() ?? null,
    ignoreReason: row.ignore_reason,
    latestAssessmentId: row.latest_assessment_id,
    latestAttemptId: row.latest_attempt_id,
    latestAttemptNumber: row.latest_attempt_number === null ? null : Number(row.latest_attempt_number),
    latestAttemptStatus: row.latest_attempt_status,
    mode: row.mode,
    maxAttempts: Number(row.max_attempts),
    name: row.name,
    reportState: row.report_state,
    reviewResolved: row.review_resolved,
    riskCounts: {
      critical: row.critical_count,
      high: row.high_count,
      info: row.info_count,
      low: row.low_count,
      medium: row.medium_count,
    },
    scanStatus: row.scan_status,
    score: row.score,
    slug: row.slug,
    subjectType: row.subject_type,
    updatedAt: row.updated_at.toISOString(),
  }
}

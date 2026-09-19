import 'server-only'

import { queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { reclaimExpiredAssessmentLeases } from './finalize'
import { createSystemAssessmentJob } from './queue'

import type { SecuritySubjectType } from './domain'

export async function runSecurityMaintenance(requestedLimit = 20) {
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
  const stale = await markExpiredReportsStale(limit)
  const leases = await reclaimExpiredAssessmentLeases(limit)
  const scheduled = await scheduleMissingAssessments(limit)
  const retention = await pruneExpiredAssessmentHistory(limit)
  return {
    reclaimedLeases: leases.reclaimed,
    retriedLeases: leases.retried,
    scheduledAssessments: scheduled,
    staleReports: stale,
    trimmedAssessments: retention,
  }
}

async function markExpiredReportsStale(limit: number) {
  return withBusinessTransaction(async (client) => {
    const result = await client.query<{ subject_id: string }>(`
      with candidates as (
        select subject_type, subject_id, row_version
        from public.ds_ai_security_subject_states
        where report_state in ('passed', 'review_required', 'blocked')
          and fresh_until is not null and fresh_until <= now()
        order by fresh_until, subject_type, subject_id
        for update skip locked
        limit $1
      )
      update public.ds_ai_security_subject_states state
      set report_state = 'stale', score = null, grade = null, verdict = null,
          stale_at = now(), row_version = state.row_version + 1
      from candidates
      where state.subject_type = candidates.subject_type
        and state.subject_id = candidates.subject_id
        and state.row_version = candidates.row_version
      returning state.subject_id
    `, [limit])
    return result.rowCount ?? result.rows.length
  })
}

async function pruneExpiredAssessmentHistory(limit: number) {
  return withBusinessTransaction(async (client) => {
    const result = await client.query<{ id: string }>(`
      with settings as (
        select report_retention_days from public.ds_ai_security_settings where id = true
      ), candidates as (
        select assessment.id
        from public.ds_ai_security_assessments assessment, settings
        where assessment.status in ('completed', 'failed', 'cancelled')
          and assessment.finished_at < now() - make_interval(days => settings.report_retention_days)
          and assessment.raw_report_file_id is null
          and not exists (
            select 1 from public.ds_ai_security_subject_states state
            where state.latest_assessment_id = assessment.id
               or state.latest_attempt_id = assessment.id
               or state.active_assessment_id = assessment.id
          )
          and not exists (
            select 1 from public.ds_ai_security_assessments child
            where child.retry_of_id = assessment.id
               or (child.retry_root_id = assessment.id and child.id <> assessment.id)
          )
          and not exists (
            select 1 from public.ds_ai_security_overrides override
            where override.assessment_id = assessment.id or override.basis_attempt_id = assessment.id
          )
        order by assessment.finished_at, assessment.id
        for update of assessment skip locked
        limit $1
      )
      delete from public.ds_ai_security_assessments assessment
      using candidates
      where assessment.id = candidates.id
      returning assessment.id
    `, [limit])
    return result.rowCount ?? result.rows.length
  })
}

async function scheduleMissingAssessments(limit: number) {
  const candidates = await queryBusiness<{ subject_id: string, subject_type: SecuritySubjectType }>(`
    select state.subject_type, state.subject_id
    from public.ds_ai_security_subject_states state
    cross join public.ds_ai_security_settings settings
    where settings.id = true
      and settings.service_enabled = true
      and state.report_state in ('unassessed', 'stale')
      and state.active_assessment_id is null
      and state.ignored_at is null
      and case state.subject_type
        when 'skill' then exists (
          select 1 from public.ds_skills skill where skill.id = state.subject_id
        )
        when 'skill_submission' then exists (
          select 1
          from public.ds_skill_submissions submission
          where submission.id = state.subject_id
            and submission.status <> 'approved'
            and not exists (
              select 1 from public.ds_skills skill
              where skill.origin_submission_id = submission.id
                 or skill.id = submission.security_target_id
            )
        )
        when 'mcp' then exists (
          select 1 from public.ds_mcps mcp where mcp.id = state.subject_id
        )
        when 'mcp_submission' then exists (
          select 1
          from public.ds_mcp_submissions submission
          where submission.id = state.subject_id
            and submission.status <> 'approved'
            and not exists (
              select 1 from public.ds_mcps mcp
              where mcp.origin_submission_id = submission.id
                 or mcp.id = submission.security_target_id
                 or mcp.id = submission.approved_mcp_id
            )
        )
        when 'prompt' then exists (
          select 1 from public.ds_prompts prompt where prompt.id = state.subject_id
        )
        else false
      end
      and case
        when state.subject_type in ('skill', 'skill_submission') then settings.skill_mode <> 'off'
        when state.subject_type in ('mcp', 'mcp_submission') then settings.mcp_mode <> 'off'
        when state.subject_type = 'prompt' then settings.prompt_mode <> 'off'
        else false
      end
    order by state.updated_at, state.subject_type, state.subject_id
    limit $1
  `, [limit])

  const results = await Promise.allSettled(candidates.rows.map(candidate => createSystemAssessmentJob({
    subjectId: candidate.subject_id,
    subjectType: candidate.subject_type,
  })))
  return results.filter(result => result.status === 'fulfilled').length
}

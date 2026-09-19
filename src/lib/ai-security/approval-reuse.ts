import 'server-only'

import { invalidateSecurityState } from './invalidation'
import { loadSecuritySubjectSnapshot } from './subject-repository'

import type { SecuritySubjectType } from './domain'
import type { PoolClient } from 'pg'

interface ReusableSubjectState {
  assessed_at: Date
  assessed_declared_fingerprint: string
  assessed_source_revision: string | null
  critical_count: number
  fresh_until: Date | null
  grade: string
  high_count: number
  info_count: number
  input_fingerprint: string
  latest_assessment_id: string
  low_count: number
  medium_count: number
  public_visible: boolean
  report_state: 'blocked' | 'passed' | 'review_required'
  scanner_config_fingerprint: string
  score: number
  verdict: 'blocked' | 'passed' | 'review_required'
}

/**
 * Makes the published object the canonical security subject after approval.
 * A current submission report can be reused because Skill/MCP snapshots use
 * the same declared payload for submissions and published records.
 */
export async function initializeApprovedSecuritySubject(
  client: PoolClient,
  input: {
    actorId: string
    sourceId: string
    sourceType: Extract<SecuritySubjectType, 'mcp_submission' | 'skill_submission'>
    targetId: string
    targetType: Extract<SecuritySubjectType, 'mcp' | 'skill'>
  },
) {
  const snapshot = await loadSecuritySubjectSnapshot(client, input.targetType, input.targetId)
  await invalidateSecurityState(client, {
    id: input.targetId,
    type: input.targetType,
  }, snapshot.declaredFingerprint)

  const reusable = await client.query<ReusableSubjectState>(`
    select state.latest_assessment_id, state.assessed_declared_fingerprint,
           state.assessed_source_revision, state.scanner_config_fingerprint,
           state.report_state, state.score, state.grade, state.verdict,
           state.critical_count, state.high_count, state.medium_count,
           state.low_count, state.info_count, state.fresh_until,
           state.assessed_at, state.public_visible, assessment.input_fingerprint
    from public.ds_ai_security_subject_states state
    join public.ds_ai_security_assessments assessment
      on assessment.id = state.latest_assessment_id
    where state.subject_type = $1 and state.subject_id = $2::uuid
      and assessment.status = 'completed'
      and assessment.input_fingerprint is not null
      and state.report_state in ('passed', 'review_required', 'blocked')
      and state.ignored_at is null
      and state.current_declared_fingerprint = $3
      and state.assessed_declared_fingerprint = $3
      and (state.fresh_until is null or state.fresh_until > now())
    limit 1
  `, [input.sourceType, input.sourceId, snapshot.declaredFingerprint])
  const state = reusable.rows[0]
  if (!state)
    return { reused: false as const }

  await client.query(`
    insert into public.ds_ai_security_assessment_bindings (
      assessment_id, subject_type, subject_id, binding_kind,
      bound_declared_fingerprint, bound_input_fingerprint, bound_by
    ) values ($1::uuid, $2, $3::uuid, 'reused_on_approval', $4, $5, $6::uuid)
    on conflict (assessment_id, subject_type, subject_id) do nothing
  `, [
    state.latest_assessment_id,
    input.targetType,
    input.targetId,
    snapshot.declaredFingerprint,
    state.input_fingerprint,
    input.actorId,
  ])
  await client.query(`
    update public.ds_ai_security_subject_states
    set latest_assessment_id = $3::uuid,
        latest_attempt_id = $3::uuid,
        assessed_declared_fingerprint = $4,
        current_declared_fingerprint = $4,
        assessed_source_revision = $5,
        scanner_config_fingerprint = $6,
        report_state = $7,
        score = $8,
        grade = $9,
        verdict = $10,
        critical_count = $11,
        high_count = $12,
        medium_count = $13,
        low_count = $14,
        info_count = $15,
        fresh_until = $16,
        assessed_at = $17,
        stale_at = null,
        public_visible = $18,
        row_version = row_version + 1
    where subject_type = $1 and subject_id = $2::uuid
      and active_assessment_id is null
      and latest_assessment_id is null
  `, [
    input.targetType,
    input.targetId,
    state.latest_assessment_id,
    snapshot.declaredFingerprint,
    state.assessed_source_revision,
    state.scanner_config_fingerprint,
    state.report_state,
    state.score,
    state.grade,
    state.verdict,
    state.critical_count,
    state.high_count,
    state.medium_count,
    state.low_count,
    state.info_count,
    state.fresh_until,
    state.assessed_at,
    state.public_visible,
  ])
  return { assessmentId: state.latest_assessment_id, reused: true as const }
}

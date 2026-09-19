import 'server-only'

import type { SecurityPublicSubjectType, SecuritySubjectType } from './domain'
import type { PoolClient } from 'pg'

export interface SecuritySubjectReference {
  id: string
  type: SecuritySubjectType
}

export async function deleteSecuritySubjectState(client: PoolClient, subject: SecuritySubjectReference) {
  await client.query(`
    delete from public.ds_ai_security_subject_states
    where subject_type = $1 and subject_id = $2::uuid
  `, [subject.type, subject.id])
}

export async function invalidateSecurityState(
  client: PoolClient,
  subject: SecuritySubjectReference,
  nextDeclaredFingerprint: string,
) {
  const result = await client.query<{ report_state: string, row_version: string }>(`
    insert into public.ds_ai_security_subject_states (
      subject_type, subject_id, current_declared_fingerprint, report_state
    ) values ($1, $2::uuid, $3, 'unassessed')
    on conflict (subject_type, subject_id) do update set
      current_declared_fingerprint = excluded.current_declared_fingerprint,
      report_state = case
        when ds_ai_security_subject_states.latest_assessment_id is null then 'unassessed'
        else 'stale'
      end,
      score = null,
      grade = null,
      verdict = null,
      stale_at = case
        when ds_ai_security_subject_states.latest_assessment_id is null then ds_ai_security_subject_states.stale_at
        else now()
      end,
      row_version = ds_ai_security_subject_states.row_version + 1
    where ds_ai_security_subject_states.current_declared_fingerprint <> excluded.current_declared_fingerprint
    returning report_state, row_version
  `, [subject.type, subject.id, nextDeclaredFingerprint])
  return result.rows[0]
    ? { changed: true, reportState: result.rows[0].report_state, rowVersion: Number(result.rows[0].row_version) }
    : { changed: false }
}

export async function revertPublishedSubjectToDraft(
  client: PoolClient,
  subjectType: SecurityPublicSubjectType,
  subjectId: string,
) {
  const table = {
    mcp: 'ds_mcps',
    prompt: 'ds_prompts',
    skill: 'ds_skills',
  }[subjectType]
  const result = await client.query<{ id: string }>(`
    update public.${table}
    set status = 'draft'
    where id = $1::uuid and status = 'published'
    returning id
  `, [subjectId])
  return Boolean(result.rowCount)
}

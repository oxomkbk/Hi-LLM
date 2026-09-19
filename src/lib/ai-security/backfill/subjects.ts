import { isRetryableSecurityErrorCode } from '../errors'

import type { SecurityReportState, SecuritySubjectType } from '../domain'
import type { PoolClient } from 'pg'

export type BackfillPublicType = 'mcp' | 'prompt' | 'skill'

export interface BackfillScopeEntry {
  declaredFingerprint: string
  id: string
  sourceSortKey: string
  subjectType: SecuritySubjectType
}

interface CandidateState {
  activeAssessmentId: string | null
  ignoredAt: Date | null
  latestErrorCode: string | null
  reportState: SecurityReportState
}

interface ListedSubject {
  id: string
  sort_order: number
  source_sort_key: string
  subject_type: SecuritySubjectType
}

interface StoredStateRow {
  active_assessment_id: string | null
  current_declared_fingerprint: string
  ignored_at: Date | null
  latest_assessment_id: string | null
  latest_error_code: string | null
  report_state: SecurityReportState
}

const SUBJECT_ORDER: Record<SecuritySubjectType, number> = {
  mcp: 2,
  mcp_submission: 3,
  prompt: 4,
  skill: 0,
  skill_submission: 1,
}

export function applyBackfillLimit<T extends Pick<BackfillScopeEntry, 'id' | 'sourceSortKey' | 'subjectType'>>(
  scope: readonly T[],
  limit?: number,
) {
  const ordered = [...scope].sort((left, right) => {
    return SUBJECT_ORDER[left.subjectType] - SUBJECT_ORDER[right.subjectType]
      || left.sourceSortKey.localeCompare(right.sourceSortKey)
      || left.id.localeCompare(right.id)
  })
  return limit === undefined ? ordered : ordered.slice(0, limit)
}

export function expandBackfillSubjectTypes(types: readonly BackfillPublicType[]) {
  const selected = new Set(types)
  const expanded: SecuritySubjectType[] = []
  if (selected.has('skill'))
    expanded.push('skill', 'skill_submission')
  if (selected.has('mcp'))
    expanded.push('mcp', 'mcp_submission')
  if (selected.has('prompt'))
    expanded.push('prompt')
  return expanded
}

export function isBackfillCandidate(state: CandidateState) {
  if (state.ignoredAt || state.activeAssessmentId)
    return false
  if (state.reportState === 'unassessed' || state.reportState === 'stale')
    return true
  return state.reportState === 'failed'
    && Boolean(state.latestErrorCode && isRetryableSecurityErrorCode(state.latestErrorCode))
}

export async function reconcileSecuritySubjects(input: {
  apply: boolean
  pageSize?: number
  types: readonly BackfillPublicType[]
}) {
  const subjectTypes = expandBackfillSubjectTypes(input.types)
  if (subjectTypes.length === 0)
    throw new TypeError('At least one security backfill type is required')
  const pageSize = Math.max(1, Math.min(500, Math.trunc(input.pageSize ?? 100)))
  const [{ getBusinessPool, withBusinessTransaction }, { invalidateSecurityState }, subjectRepository] = await Promise.all([
    import('@/lib/db/business'),
    import('../invalidation'),
    import('../subject-repository'),
  ])
  const pool = await getBusinessPool()
  const listClient = await pool.connect()
  const syncScope: BackfillScopeEntry[] = []
  const candidates: BackfillScopeEntry[] = []
  const errors: Array<{ code: string, id: string, subjectType: SecuritySubjectType }> = []
  const counters = {
    changed: 0,
    current: 0,
    ignored: 0,
    missing: 0,
    total: 0,
    unreadable: 0,
  }
  let cursor: ListedSubject | null = null
  try {
    for (;;) {
      const page = await listSubjects(listClient, subjectTypes, cursor, pageSize)
      if (page.length === 0)
        break
      for (const subject of page) {
        counters.total += 1
        try {
          let snapshot: Awaited<ReturnType<typeof subjectRepository.loadSecuritySubjectSnapshot>>
          let state: StoredStateRow | null
          if (input.apply) {
            const applied = await withBusinessTransaction(async (client) => {
              await subjectRepository.lockSecuritySubjectRow(client, subject.subject_type, subject.id)
              const nextSnapshot = await subjectRepository.loadSecuritySubjectSnapshot(client, subject.subject_type, subject.id)
              const before = await readState(client, subject.subject_type, subject.id, true)
              if (before?.ignored_at)
                return { snapshot: nextSnapshot, state: before, sync: 'ignored' as const }
              const result = await invalidateSecurityState(client, {
                id: subject.id,
                type: subject.subject_type,
              }, nextSnapshot.declaredFingerprint)
              const after = await readState(client, subject.subject_type, subject.id, false)
              return {
                snapshot: nextSnapshot,
                state: after,
                sync: before ? result.changed ? 'changed' as const : 'current' as const : 'missing' as const,
              }
            })
            snapshot = applied.snapshot
            state = applied.state
            counters[applied.sync] += 1
          }
          else {
            snapshot = await subjectRepository.loadSecuritySubjectSnapshot(listClient, subject.subject_type, subject.id)
            const stored = await readState(listClient, subject.subject_type, subject.id, false)
            if (!stored) {
              counters.missing += 1
              state = simulatedState(snapshot.declaredFingerprint)
            }
            else if (stored.ignored_at) {
              counters.ignored += 1
              state = stored
            }
            else if (stored.current_declared_fingerprint !== snapshot.declaredFingerprint) {
              counters.changed += 1
              state = {
                ...stored,
                current_declared_fingerprint: snapshot.declaredFingerprint,
                report_state: stored.latest_assessment_id ? 'stale' : 'unassessed',
              }
            }
            else {
              counters.current += 1
              state = stored
            }
          }

          if (!state)
            throw new Error('Security subject state was not synchronized')
          const entry = {
            declaredFingerprint: snapshot.declaredFingerprint,
            id: subject.id,
            sourceSortKey: subject.source_sort_key,
            subjectType: subject.subject_type,
          }
          syncScope.push(entry)
          if (isBackfillCandidate({
            activeAssessmentId: state.active_assessment_id,
            ignoredAt: state.ignored_at,
            latestErrorCode: state.latest_error_code,
            reportState: state.report_state,
          })) {
            candidates.push(entry)
          }
        }
        catch (error) {
          counters.unreadable += 1
          errors.push({
            code: safeErrorCode(error),
            id: subject.id,
            subjectType: subject.subject_type,
          })
        }
      }
      cursor = page.at(-1)!
    }
  }
  finally {
    listClient.release()
  }
  return {
    candidates: applyBackfillLimit(candidates),
    counters,
    errors,
    syncScope: applyBackfillLimit(syncScope),
  }
}

async function listSubjects(
  client: PoolClient,
  subjectTypes: readonly SecuritySubjectType[],
  cursor: ListedSubject | null,
  limit: number,
) {
  const result = await client.query<ListedSubject>(`
    with subjects as (
      select 0 as sort_order, 'skill'::text as subject_type, id,
             lower(coalesce(nullif(btrim(source_url), ''), slug, id::text)) as source_sort_key
      from public.ds_skills
      union all
      select 1, 'skill_submission', id,
             lower(coalesce(nullif(btrim(source_url), ''), slug, id::text))
      from public.ds_skill_submissions
      where status in ('pending', 'pending_security')
      union all
      select 2, 'mcp', id,
             lower(coalesce(nullif(btrim(source_url), ''), slug, id::text))
      from public.ds_mcps
      union all
      select 3, 'mcp_submission', id,
             lower(coalesce(nullif(btrim(source_url), ''), slug, id::text))
      from public.ds_mcp_submissions
      where status in ('pending', 'pending_security')
      union all
      select 4, 'prompt', id, lower(coalesce(slug, id::text))
      from public.ds_prompts
    )
    select sort_order, subject_type, id, source_sort_key
    from subjects
    where subject_type = any($1::text[])
      and (
        $2::integer is null
        or (sort_order, source_sort_key, id) > ($2::integer, $3::text, $4::uuid)
      )
    order by sort_order, source_sort_key, id
    limit $5
  `, [
    [...subjectTypes],
    cursor?.sort_order ?? null,
    cursor?.source_sort_key ?? null,
    cursor?.id ?? null,
    limit,
  ])
  return result.rows
}

async function readState(
  client: PoolClient,
  subjectType: SecuritySubjectType,
  subjectId: string,
  lock: boolean,
) {
  const result = await client.query<StoredStateRow>(`
    select state.active_assessment_id, state.current_declared_fingerprint,
           state.ignored_at, state.latest_assessment_id, state.report_state,
           latest.error_code as latest_error_code
    from public.ds_ai_security_subject_states state
    left join public.ds_ai_security_assessments latest
      on latest.id = state.latest_attempt_id
    where state.subject_type = $1 and state.subject_id = $2::uuid
    ${lock ? 'for update of state' : ''}
  `, [subjectType, subjectId])
  return result.rows[0] ?? null
}

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string')
    return error.code.slice(0, 100)
  return 'SECURITY_SUBJECT_UNREADABLE'
}

function simulatedState(fingerprint: string): StoredStateRow {
  return {
    active_assessment_id: null,
    current_declared_fingerprint: fingerprint,
    ignored_at: null,
    latest_assessment_id: null,
    latest_error_code: null,
    report_state: 'unassessed',
  }
}

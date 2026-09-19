import 'server-only'

import { ensureBusinessUser, withBusinessTransaction } from '@/lib/db/business'

import { enqueueSecurityAudit } from './audit-outbox'
import { invalidateSecurityState } from './invalidation'
import { loadSecuritySubjectSnapshot, lockSecuritySubjectRow } from './subject-repository'

import type { SecuritySubjectType } from './domain'
import type { Actor } from '@/lib/repositories/catalog'

export async function setSecuritySubjectIgnored(input: {
  actor: Actor
  ignored: boolean
  reason?: string | null
  subjectId: string
  subjectType: SecuritySubjectType
}) {
  return withBusinessTransaction(async (client) => {
    await ensureBusinessUser(input.actor, client)
    await lockSecuritySubjectRow(client, input.subjectType, input.subjectId)
    const snapshot = await loadSecuritySubjectSnapshot(client, input.subjectType, input.subjectId)
    await invalidateSecurityState(client, {
      id: input.subjectId,
      type: input.subjectType,
    }, snapshot.declaredFingerprint)

    if (input.ignored) {
      await client.query(`
        update public.ds_ai_security_assessments
        set status = 'cancelled', cancel_requested_at = now(),
            cancel_requested_by = $3::uuid, finished_at = now()
        where subject_type = $1 and subject_id = $2::uuid and status = 'queued'
      `, [input.subjectType, input.subjectId, input.actor.id])
      await client.query(`
        update public.ds_ai_security_assessments
        set cancel_requested_at = coalesce(cancel_requested_at, now()),
            cancel_requested_by = coalesce(cancel_requested_by, $3::uuid)
        where subject_type = $1 and subject_id = $2::uuid
          and status in ('preparing', 'running')
      `, [input.subjectType, input.subjectId, input.actor.id])
      await client.query(`
        update public.ds_ai_security_subject_states
        set ignored_at = now(), ignored_by = $3::uuid, ignore_reason = $4,
            active_assessment_id = case
              when exists (
                select 1 from public.ds_ai_security_assessments assessment
                where assessment.id = active_assessment_id and assessment.status = 'cancelled'
              ) then null
              else active_assessment_id
            end,
            row_version = row_version + 1
        where subject_type = $1 and subject_id = $2::uuid
      `, [input.subjectType, input.subjectId, input.actor.id, cleanReason(input.reason)])
    }
    else {
      await client.query(`
        update public.ds_ai_security_subject_states
        set ignored_at = null, ignored_by = null, ignore_reason = null,
            row_version = row_version + 1
        where subject_type = $1 and subject_id = $2::uuid
      `, [input.subjectType, input.subjectId])
    }

    await enqueueSecurityAudit(client, {
      action: input.ignored ? 'security.subject.ignore' : 'security.subject.restore',
      actorUserId: input.actor.id,
      code: input.ignored ? 'SECURITY_SUBJECT_IGNORED' : 'SECURITY_SUBJECT_RESTORED',
      metadata: { subjectId: input.subjectId, subjectType: input.subjectType },
      resourceId: input.subjectId,
      resourceType: input.subjectType,
      success: true,
    })
    return {
      ignored: input.ignored,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
    }
  })
}

function cleanReason(value: string | null | undefined) {
  const normalized = value?.normalize('NFC').trim().slice(0, 500)
  return normalized || null
}

import 'server-only'

import { initializeApprovedSecuritySubject } from '@/lib/ai-security/approval-reuse'
import { invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { evaluateSkillPublishGate } from '@/lib/ai-security/publish-gate'
import { loadSecuritySubjectSnapshot } from '@/lib/ai-security/subject-repository'
import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { hasSkillCanonicalConflict, skillCanonicalKey } from './skill-canonical'

import type { Actor, PageResult } from './catalog'
import type { SanitizedSubmitter } from '@/lib/skills'
import type { SkillContent, SkillSubmission, SkillSubmissionStatus } from '@/types'

export class SkillSubmissionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export class SkillSubmissionRepository {
  async list(input: { limit: number, offset: number, q?: string, status?: SkillSubmissionStatus }): Promise<PageResult<SkillSubmission>> {
    const conditions: string[] = []
    const values: unknown[] = []
    if (input.q) {
      values.push(`%${input.q}%`)
      conditions.push(`(submission.name ilike $${values.length} or submission.summary ilike $${values.length} or submission.author_name ilike $${values.length} or submission.submitter_name ilike $${values.length})`)
    }
    if (input.status) {
      values.push(input.status)
      conditions.push(`submission.status = $${values.length}`)
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
    const count = await queryBusiness<{ total: string }>(`select count(*)::text as total from public.ds_skill_submissions submission ${where}`, values)
    values.push(input.limit, input.offset)
    const result = await queryBusiness<SkillSubmission>(`
      select submission.*,
             security_state.report_state as security_report_state,
             security_state.score as security_score,
             security_state.grade as security_grade,
             security_state.assessed_at as security_assessed_at,
             security_active.status as security_scan_status,
             coalesce(security_state.active_assessment_id, security_state.latest_assessment_id) as security_assessment_id
      from public.ds_skill_submissions submission
      left join public.ds_ai_security_subject_states security_state
        on security_state.subject_type = 'skill_submission' and security_state.subject_id = submission.id
      left join public.ds_ai_security_assessments security_active
        on security_active.id = security_state.active_assessment_id
      ${where}
      order by submission.created_at desc, submission.id
      limit $${values.length - 1} offset $${values.length}
    `, values)
    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async create(skill: SkillContent, submitter: SanitizedSubmitter, submittedIpHash: string) {
    return withBusinessTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`skill-submit:${submittedIpHash}`])
      const recent = await client.query<{ recent_count: string }>(`
        select count(*)::text as recent_count
        from public.ds_skill_submissions
        where submitted_ip_hash = $1 and created_at >= now() - interval '24 hours'
      `, [submittedIpHash])
      if (Number(recent.rows[0]!.recent_count) >= 3)
        throw new SkillSubmissionError('24 小时内最多提交 3 个 Skill', 429)
      if (await hasSkillCanonicalConflict(client, skill))
        throw new SkillSubmissionError('该 Skill 已提交或已发布', 409)

      const result = await client.query<Pick<SkillSubmission, 'created_at' | 'id' | 'status'>>(`
        insert into public.ds_skill_submissions (
          slug, name, summary, description, category, tags, platforms, source_kind, source_url,
          homepage_url, install_command, author_name, author_url, version, license,
          icon, submitter_name, submitter_email, submitted_ip_hash
        ) values (
          $1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) returning id, status, created_at
      `, skillSubmissionValues(skill, submitter, submittedIpHash))
      return result.rows[0]!
    })
  }

  async findById(id: string) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<SkillSubmission>(`
        select submission.*,
               security_state.report_state as security_report_state,
               security_state.score as security_score,
               security_state.grade as security_grade,
               security_state.assessed_at as security_assessed_at,
               security_active.status as security_scan_status,
               coalesce(security_state.active_assessment_id, security_state.latest_assessment_id) as security_assessment_id
        from public.ds_skill_submissions submission
        left join public.ds_ai_security_subject_states security_state
          on security_state.subject_type = 'skill_submission' and security_state.subject_id = submission.id
        left join public.ds_ai_security_assessments security_active
          on security_active.id = security_state.active_assessment_id
        where submission.id = $1::uuid
        limit 1
      `, [id])
      const submission = result.rows[0]
      if (!submission)
        return null
      const gate = await evaluateSkillPublishGate(client, { id, type: 'skill_submission' })
      return {
        ...submission,
        security_publish_ready: gate.allowed,
        security_publish_reason: gate.reason,
      }
    })
  }

  async update(id: string, skill: SkillContent, submitter: SanitizedSubmitter) {
    return withBusinessTransaction(async (client) => {
      if (await hasSkillCanonicalConflict(client, skill, { submissionId: id }))
        throw new SkillSubmissionError('该 Skill 已提交或已发布', 409)
      const values = skillSubmissionValues(skill, submitter, '')
      const result = await client.query<SkillSubmission>(`
        update public.ds_skill_submissions set
          slug = $2, name = $3, summary = $4, description = $5, category = $6,
          tags = $7::text[], platforms = $8::text[], source_kind = $9, source_url = $10, homepage_url = $11,
          install_command = $12, author_name = $13, author_url = $14, version = $15,
          license = $16, icon = $17, submitter_name = $18, submitter_email = $19
        where id = $1::uuid and status <> 'approved'
        returning *
      `, [id, ...values.slice(0, 18)])
      if (!result.rows[0])
        return null
      const snapshot = await loadSecuritySubjectSnapshot(client, 'skill_submission', id)
      await invalidateSecurityState(client, { id, type: 'skill_submission' }, snapshot.declaredFingerprint)
      return result.rows[0]
    })
  }

  async approve(
    id: string,
    actor: Actor,
    edited?: { expectedUpdatedAt?: string, skill: SkillContent, submitter: SanitizedSubmitter },
    reviewNote?: string | null,
  ) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const current = await client.query<SkillSubmission>(`
        select * from public.ds_skill_submissions where id = $1::uuid for update
      `, [id])
      let submission = current.rows[0]
      if (!submission)
        throw new SkillSubmissionError('投稿不存在', 404)
      if (submission.status === 'approved') {
        const existing = await client.query<{ id: string, slug: string }>(`
          select id, slug from public.ds_skills
          where origin_submission_id = $1::uuid
             or id = $2::uuid
          order by (origin_submission_id = $1::uuid) desc
          limit 1
        `, [id, submission.security_target_id])
        if (!existing.rows[0])
          throw new SkillSubmissionError('投稿已通过，但未找到关联的正式内容，请修复数据关联', 409)
        return { id, skill_id: existing.rows[0].id, slug: existing.rows[0].slug, status: 'approved' as const }
      }
      if (submission.status !== 'pending' && submission.status !== 'pending_security')
        throw new SkillSubmissionError('仅待审核投稿可以通过', 409)

      if (edited) {
        if (edited.expectedUpdatedAt && new Date(submission.updated_at).toISOString() !== new Date(edited.expectedUpdatedAt).toISOString())
          throw new SkillSubmissionError('投稿内容已被其他管理员修改，请刷新后重试', 409)
        const values = skillSubmissionValues(edited.skill, edited.submitter, '')
        const updated = await client.query<SkillSubmission>(`
          update public.ds_skill_submissions set
            slug = $2, name = $3, summary = $4, description = $5, category = $6,
            tags = $7::text[], platforms = $8::text[], source_kind = $9, source_url = $10,
            homepage_url = $11, install_command = $12, author_name = $13, author_url = $14,
            version = $15, license = $16, icon = $17, submitter_name = $18, submitter_email = $19
          where id = $1::uuid returning *
        `, [id, ...values.slice(0, 18)])
        submission = updated.rows[0]!
      }

      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [skillCanonicalKey(submission)])

      const submissionSnapshot = await loadSecuritySubjectSnapshot(client, 'skill_submission', id)
      await invalidateSecurityState(client, { id, type: 'skill_submission' }, submissionSnapshot.declaredFingerprint)
      const gate = await evaluateSkillPublishGate(
        client,
        { id, type: 'skill_submission' },
        submissionSnapshot.declaredFingerprint,
      )
      if (!gate.allowed)
        throw new SkillSubmissionError(gate.message, 409)

      const canonical = await client.query<{ id: string, origin_submission_id: string | null }>(`
        select id, origin_submission_id
        from public.ds_skills
        where origin_submission_id = $1::uuid
           or id = $2::uuid
           or ($3::text is not null and lower(source_url) = lower($3) and (
             ($4::text = 'git_repository' and source_kind = 'git_repository'
               and lower(coalesce(install_command, '')) = lower(coalesce($5, '')))
             or ($4::text <> 'git_repository' and source_kind <> 'git_repository')
           ))
           or ($3::text is null and (
             slug = $6
             or (lower(btrim(name)) = lower(btrim($7)) and lower(btrim(author_name)) = lower(btrim($8)))
           ))
        order by (origin_submission_id = $1::uuid) desc, (id = $2::uuid) desc, id
        for update
      `, [
        id,
        submission.security_target_id,
        submission.source_url,
        submission.source_kind,
        submission.install_command,
        submission.slug,
        submission.name,
        submission.author_name,
      ])
      if (canonical.rows.length > 1)
        throw new SkillSubmissionError('检测到多个重复的正式 Skill，请先在内容管理中合并后再通过', 409)
      if (canonical.rows[0]?.origin_submission_id && canonical.rows[0].origin_submission_id !== id)
        throw new SkillSubmissionError('该来源已由另一条投稿发布，请勿重复创建', 409)

      const contentValues = [
        submission.slug,
        submission.name,
        submission.summary,
        submission.description,
        submission.category,
        submission.tags,
        submission.platforms,
        submission.source_kind,
        submission.source_url,
        submission.homepage_url,
        submission.install_command,
        submission.author_name,
        submission.author_url,
        submission.version,
        submission.license,
        submission.icon,
      ]
      const skill = canonical.rows[0]
        ? await client.query<{ id: string, slug: string }>(`
            update public.ds_skills set
              slug = $2, name = $3, summary = $4, description = $5, category = $6,
              tags = $7::text[], platforms = $8::text[], source_kind = $9, source_url = $10,
              homepage_url = $11, install_command = $12, author_name = $13, author_url = $14,
              version = $15, license = $16, icon = $17, status = 'published',
              published_by = $18::uuid, published_at = coalesce(published_at, now()),
              origin_submission_id = $19::uuid
            where id = $1::uuid returning id, slug
          `, [canonical.rows[0].id, ...contentValues, actor.id, id])
        : await client.query<{ id: string, slug: string }>(`
            insert into public.ds_skills (
              slug, name, summary, description, category, tags, platforms, source_kind, source_url,
              homepage_url, install_command, author_name, author_url, version, license,
              icon, status, published_by, published_at, origin_submission_id
            ) values (
              $1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9,
              $10, $11, $12, $13, $14, $15, $16, 'published', $17::uuid, now(), $18::uuid
            ) returning id, slug
          `, [...contentValues, actor.id, id])
      await initializeApprovedSecuritySubject(client, {
        actorId: actor.id,
        sourceId: id,
        sourceType: 'skill_submission',
        targetId: skill.rows[0]!.id,
        targetType: 'skill',
      })
      await client.query(`
        update public.ds_skill_submissions
        set status = 'approved', reviewer_id = $2::uuid, reviewed_at = now(),
            review_note = coalesce($4, review_note), security_target_id = $3::uuid,
            security_review_status = 'ready', security_pending_reason = null
        where id = $1::uuid
      `, [id, actor.id, skill.rows[0]!.id, reviewNote ?? null])
      return { id, skill_id: skill.rows[0]!.id, slug: skill.rows[0]!.slug, status: 'approved' as const }
    })
  }

  async reject(id: string, actor: Actor, note: string) {
    await ensureBusinessUser(actor)
    const result = await queryBusiness<Pick<SkillSubmission, 'id' | 'review_note' | 'reviewed_at' | 'reviewer_id' | 'status'>>(`
      update public.ds_skill_submissions
      set status = 'rejected', review_note = $2, reviewer_id = $3::uuid, reviewed_at = now()
      where id = $1::uuid and status in ('pending', 'pending_security')
      returning id, status, review_note, reviewed_at, reviewer_id
    `, [id, note, actor.id])
    return result.rows[0] ?? null
  }
}

function skillSubmissionValues(skill: SkillContent, submitter: SanitizedSubmitter, submittedIpHash: string) {
  return [
    skill.slug,
    skill.name,
    skill.summary,
    skill.description,
    skill.category,
    skill.tags,
    skill.platforms,
    skill.source_kind,
    skill.source_url,
    skill.homepage_url,
    skill.install_command,
    skill.author_name,
    skill.author_url,
    skill.version,
    skill.license,
    skill.icon,
    submitter.submitter_name,
    submitter.submitter_email,
    submittedIpHash,
  ]
}

export const skillSubmissionRepository = new SkillSubmissionRepository()

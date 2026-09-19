import 'server-only'

import { initializeApprovedSecuritySubject } from '@/lib/ai-security/approval-reuse'
import { invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { evaluateAiContentPublishGate } from '@/lib/ai-security/publish-gate'
import { loadSecuritySubjectSnapshot } from '@/lib/ai-security/subject-repository'
import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { hasMcpCanonicalConflict, lockMcpCanonicalIdentity } from './mcp-canonical'

import type { Actor, PageResult } from './catalog'
import type { McpContent, McpSubmission, McpSubmissionStatus } from '@/types'

interface McpSubmitter {
  submitter_email: string | null
  submitter_name: string
}

export class McpSubmissionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export class McpSubmissionRepository {
  async list(input: { limit: number, offset: number, q?: string, status?: McpSubmissionStatus }): Promise<PageResult<McpSubmission>> {
    const conditions: string[] = []
    const values: unknown[] = []
    if (input.q) {
      values.push(`%${input.q}%`)
      conditions.push(`(submission.name ilike $${values.length} or submission.summary ilike $${values.length} or submission.publisher_name ilike $${values.length} or submission.submitter_name ilike $${values.length})`)
    }
    if (input.status) {
      values.push(input.status)
      conditions.push(`submission.status = $${values.length}`)
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
    const count = await queryBusiness<{ total: string }>(`select count(*)::text as total from public.ds_mcp_submissions submission ${where}`, values)
    values.push(input.limit, input.offset)
    const result = await queryBusiness<McpSubmission>(`
      select submission.*,
             security_state.report_state as security_report_state,
             security_state.score as security_score,
             security_state.grade as security_grade,
             security_state.assessed_at as security_assessed_at,
             security_active.status as security_scan_status,
             coalesce(security_state.active_assessment_id, security_state.latest_assessment_id) as security_assessment_id
      from public.ds_mcp_submissions submission
      left join public.ds_ai_security_subject_states security_state
        on security_state.subject_type = 'mcp_submission' and security_state.subject_id = submission.id
      left join public.ds_ai_security_assessments security_active
        on security_active.id = security_state.active_assessment_id
      ${where}
      order by submission.created_at desc, submission.id
      limit $${values.length - 1} offset $${values.length}
    `, values)
    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async create(input: {
    contactHash: string
    ipHash: string
    mcp: McpContent
    submitter: McpSubmitter
  }) {
    return withBusinessTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('mcp-submit:global'))`)
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`mcp-submit:${input.ipHash}`])
      const rate = await client.query<{ contact_count: string, global_count: string, ip_count: string }>(`
        select
          (select count(*)::text from app_private.mcp_submission_rate_events where bucket_type = 'global' and created_at >= now() - interval '1 hour') as global_count,
          (select count(*)::text from app_private.mcp_submission_rate_events where bucket_type = 'ip' and bucket_key = $1 and created_at >= now() - interval '24 hours') as ip_count,
          (select count(*)::text from app_private.mcp_submission_rate_events where bucket_type = 'contact' and bucket_key = $2 and created_at >= now() - interval '24 hours') as contact_count
      `, [input.ipHash, input.contactHash])
      const counters = rate.rows[0]!
      if (Number(counters.global_count) >= 120 || Number(counters.ip_count) >= 3 || Number(counters.contact_count) >= 3)
        throw new McpSubmissionError('投稿过于频繁，请稍后再试', 429)
      if (await hasMcpCanonicalConflict(client, input.mcp))
        throw new McpSubmissionError('该 MCP 已提交或发布', 409)

      await client.query(`
        insert into app_private.mcp_submission_rate_events (bucket_type, bucket_key)
        values ('global', 'global'), ('ip', $1), ('contact', $2)
      `, [input.ipHash, input.contactHash])
      const result = await client.query<Pick<McpSubmission, 'id' | 'status'>>(`
        insert into public.ds_mcp_submissions (
          slug, registry_name, name, summary, description, category, tags,
          capabilities, clients, language, protocol_version, installations,
          source_url, homepage_url, docs_url, publisher_name, publisher_url,
          version, license, icon, submitter_name, submitter_email,
          submitted_ip_hash, submitted_contact_hash
        ) values (
          $1, $2, $3, $4, $5, $6, $7::text[],
          $8::text[], $9::text[], $10, $11, $12::jsonb,
          $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24
        ) returning id, status
      `, mcpSubmissionValues(input.mcp, input.submitter, input.ipHash, input.contactHash))
      return result.rows[0]!
    })
  }

  async findById(id: string) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<McpSubmission>(`
        select submission.*,
               security_state.report_state as security_report_state,
               security_state.score as security_score,
               security_state.grade as security_grade,
               security_state.assessed_at as security_assessed_at,
               security_active.status as security_scan_status,
               coalesce(security_state.active_assessment_id, security_state.latest_assessment_id) as security_assessment_id
        from public.ds_mcp_submissions submission
        left join public.ds_ai_security_subject_states security_state
          on security_state.subject_type = 'mcp_submission' and security_state.subject_id = submission.id
        left join public.ds_ai_security_assessments security_active
          on security_active.id = security_state.active_assessment_id
        where submission.id = $1::uuid
        limit 1
      `, [id])
      const submission = result.rows[0]
      if (!submission)
        return null
      const gate = await evaluateAiContentPublishGate(client, 'mcp', { id, type: 'mcp_submission' })
      return {
        ...submission,
        security_publish_ready: gate.allowed,
        security_publish_reason: gate.reason,
      }
    })
  }

  async update(id: string, mcp: McpContent, submitter: McpSubmitter, expectedUpdatedAt?: string) {
    return withBusinessTransaction(async (client) => {
      const current = await client.query<Pick<McpSubmission, 'status' | 'updated_at'>>(`
        select status, updated_at from public.ds_mcp_submissions where id = $1::uuid for update
      `, [id])
      if (!current.rows[0] || current.rows[0].status === 'approved')
        return null
      if (expectedUpdatedAt && new Date(current.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())
        throw new McpSubmissionError('投稿内容已被其他管理员修改，请刷新后重试', 409)
      if (await hasMcpCanonicalConflict(client, mcp, { submissionId: id }))
        throw new McpSubmissionError('该 MCP 已提交或发布', 409)
      const values = mcpSubmissionValues(mcp, submitter, '', '')
      const result = await client.query<McpSubmission>(`
        update public.ds_mcp_submissions set
          slug = $2, registry_name = $3, name = $4, summary = $5, description = $6,
          category = $7, tags = $8::text[], capabilities = $9::text[], clients = $10::text[],
          language = $11, protocol_version = $12, installations = $13::jsonb,
          source_url = $14, homepage_url = $15, docs_url = $16, publisher_name = $17,
          publisher_url = $18, version = $19, license = $20, icon = $21,
          submitter_name = $22, submitter_email = $23
        where id = $1::uuid and status <> 'approved'
        returning *
      `, [id, ...values.slice(0, 22)])
      if (!result.rows[0])
        return null
      const snapshot = await loadSecuritySubjectSnapshot(client, 'mcp_submission', id)
      await invalidateSecurityState(client, { id, type: 'mcp_submission' }, snapshot.declaredFingerprint)
      return result.rows[0]
    })
  }

  async approve(
    id: string,
    actor: Actor,
    edited?: { expectedUpdatedAt?: string, mcp: McpContent, submitter: McpSubmitter },
    reviewNote?: string | null,
  ) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const current = await client.query<McpSubmission>(`
        select * from public.ds_mcp_submissions where id = $1::uuid for update
      `, [id])
      let submission = current.rows[0]
      if (!submission)
        throw new McpSubmissionError('投稿不存在', 404)
      if (submission.status === 'approved') {
        const existing = await client.query<{ id: string, slug: string }>(`
          select id, slug from public.ds_mcps
          where origin_submission_id = $1::uuid
             or id = $2::uuid
             or id = $3::uuid
          order by (origin_submission_id = $1::uuid) desc
          limit 1
        `, [id, submission.security_target_id, submission.approved_mcp_id])
        if (!existing.rows[0])
          throw new McpSubmissionError('投稿已通过，但未找到关联的正式内容，请修复数据关联', 409)
        return { id: existing.rows[0].id, slug: existing.rows[0].slug, status: 'published' as const }
      }
      if (submission.status !== 'pending' && submission.status !== 'pending_security')
        throw new McpSubmissionError('仅待审核投稿可以通过', 409)

      if (edited) {
        if (edited.expectedUpdatedAt && new Date(submission.updated_at).toISOString() !== new Date(edited.expectedUpdatedAt).toISOString())
          throw new McpSubmissionError('投稿内容已被其他管理员修改，请刷新后重试', 409)
        const values = mcpSubmissionValues(edited.mcp, edited.submitter, '', '')
        const updated = await client.query<McpSubmission>(`
          update public.ds_mcp_submissions set
            slug = $2, registry_name = $3, name = $4, summary = $5, description = $6,
            category = $7, tags = $8::text[], capabilities = $9::text[], clients = $10::text[],
            language = $11, protocol_version = $12, installations = $13::jsonb,
            source_url = $14, homepage_url = $15, docs_url = $16, publisher_name = $17,
            publisher_url = $18, version = $19, license = $20, icon = $21,
            submitter_name = $22, submitter_email = $23
          where id = $1::uuid returning *
        `, [id, ...values.slice(0, 22)])
        submission = updated.rows[0]!
      }

      await lockMcpCanonicalIdentity(client, submission)
      const competingSubmission = await client.query<{ exists: boolean }>(`
        select exists(
          select 1 from public.ds_mcp_submissions
          where id <> $1::uuid and status in ('pending', 'pending_security')
            and (
              lower(source_url) = lower($2)
              or ($3::text is not null and lower(btrim(registry_name)) = lower(btrim($3)))
              or lower(slug) = lower($4)
            )
        ) as exists
      `, [id, submission.source_url, submission.registry_name, submission.slug])
      if (competingSubmission.rows[0]?.exists)
        throw new McpSubmissionError('存在另一条相同 MCP 的待审投稿，请先处理重复内容', 409)
      const submissionSnapshot = await loadSecuritySubjectSnapshot(client, 'mcp_submission', id)
      await invalidateSecurityState(client, { id, type: 'mcp_submission' }, submissionSnapshot.declaredFingerprint)
      const gate = await evaluateAiContentPublishGate(
        client,
        'mcp',
        { id, type: 'mcp_submission' },
        submissionSnapshot.declaredFingerprint,
      )
      if (!gate.allowed)
        throw new McpSubmissionError(gate.message, 409)

      const canonical = await client.query<{ id: string, origin_submission_id: string | null }>(`
        select id, origin_submission_id
        from public.ds_mcps
        where origin_submission_id = $1::uuid
           or id = $2::uuid
           or id = $3::uuid
           or lower(source_url) = lower($4)
           or ($5::text is not null and lower(btrim(registry_name)) = lower(btrim($5)))
           or lower(slug) = lower($6)
        order by (origin_submission_id = $1::uuid) desc,
                 (id = $2::uuid) desc,
                 (id = $3::uuid) desc,
                 id
        for update
      `, [id, submission.security_target_id, submission.approved_mcp_id, submission.source_url, submission.registry_name, submission.slug])
      if (canonical.rows.length > 1)
        throw new McpSubmissionError('检测到多个重复的正式 MCP，请先在内容管理中合并后再通过', 409)
      if (canonical.rows[0]?.origin_submission_id && canonical.rows[0].origin_submission_id !== id)
        throw new McpSubmissionError('该 MCP 已由另一条投稿发布，请勿重复创建', 409)

      const values = mcpPublishedValues(submission, actor.id)
      const result = canonical.rows[0]
        ? await client.query<{ id: string, slug: string }>(`
            update public.ds_mcps set
              slug = $2, registry_name = $3, name = $4, summary = $5, description = $6,
              category = $7, tags = $8::text[], capabilities = $9::text[], clients = $10::text[],
              language = $11, protocol_version = $12, installations = $13::jsonb,
              source_url = $14, homepage_url = $15, docs_url = $16, publisher_name = $17,
              publisher_url = $18, version = $19, license = $20, icon = $21,
              status = 'published', published_by = $22::uuid,
              published_at = coalesce(published_at, now()), origin_submission_id = $23::uuid
            where id = $1::uuid returning id, slug
          `, [canonical.rows[0].id, ...values, id])
        : await client.query<{ id: string, slug: string }>(`
            insert into public.ds_mcps (
              slug, registry_name, name, summary, description, category, tags,
              capabilities, clients, language, protocol_version, installations,
              source_url, homepage_url, docs_url, publisher_name, publisher_url,
              version, license, icon, status, published_by, published_at, origin_submission_id
            ) values (
              $1, $2, $3, $4, $5, $6, $7::text[],
              $8::text[], $9::text[], $10, $11, $12::jsonb,
              $13, $14, $15, $16, $17,
              $18, $19, $20, 'published', $21::uuid, now(), $22::uuid
            ) returning id, slug
          `, [...values, id])
      await initializeApprovedSecuritySubject(client, {
        actorId: actor.id,
        sourceId: id,
        sourceType: 'mcp_submission',
        targetId: result.rows[0]!.id,
        targetType: 'mcp',
      })
      await client.query(`
        update public.ds_mcp_submissions
        set status = 'approved', reviewer_id = $2::uuid, reviewed_at = now(),
            review_note = coalesce($4, review_note), approved_mcp_id = $3::uuid,
            security_target_id = $3::uuid, security_review_status = 'ready',
            security_pending_reason = null
        where id = $1::uuid
      `, [id, actor.id, result.rows[0]!.id, reviewNote ?? null])
      return { id: result.rows[0]!.id, slug: result.rows[0]!.slug, status: 'published' as const }
    })
  }

  async reject(id: string, actor: Actor, note: string, expectedUpdatedAt?: string) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const current = await client.query<Pick<McpSubmission, 'status' | 'updated_at'>>(`
        select status, updated_at from public.ds_mcp_submissions where id = $1::uuid for update
      `, [id])
      if (!current.rows[0] || (current.rows[0].status !== 'pending' && current.rows[0].status !== 'pending_security'))
        return null
      if (expectedUpdatedAt && new Date(current.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())
        throw new McpSubmissionError('投稿内容已被其他管理员修改，请刷新后重试', 409)
      const result = await client.query<Pick<McpSubmission, 'id' | 'review_note' | 'reviewed_at' | 'reviewer_id' | 'status'>>(`
        update public.ds_mcp_submissions
        set status = 'rejected', review_note = $2, reviewer_id = $3::uuid, reviewed_at = now()
        where id = $1::uuid and status in ('pending', 'pending_security')
        returning id, status, review_note, reviewed_at, reviewer_id
      `, [id, note, actor.id])
      return result.rows[0] ?? null
    })
  }
}

function mcpPublishedValues(submission: McpSubmission, actorId: string) {
  return [
    submission.slug,
    submission.registry_name,
    submission.name,
    submission.summary,
    submission.description,
    submission.category,
    submission.tags,
    submission.capabilities,
    submission.clients,
    submission.language,
    submission.protocol_version,
    JSON.stringify(submission.installations),
    submission.source_url,
    submission.homepage_url,
    submission.docs_url,
    submission.publisher_name,
    submission.publisher_url,
    submission.version,
    submission.license,
    submission.icon,
    actorId,
  ]
}

function mcpSubmissionValues(mcp: McpContent, submitter: McpSubmitter, ipHash: string, contactHash: string) {
  return [
    mcp.slug,
    mcp.registry_name,
    mcp.name,
    mcp.summary,
    mcp.description,
    mcp.category,
    mcp.tags,
    mcp.capabilities,
    mcp.clients,
    mcp.language,
    mcp.protocol_version,
    JSON.stringify(mcp.installations),
    mcp.source_url,
    mcp.homepage_url,
    mcp.docs_url,
    mcp.publisher_name,
    mcp.publisher_url,
    mcp.version,
    mcp.license,
    mcp.icon,
    submitter.submitter_name,
    submitter.submitter_email,
    ipHash,
    contactHash,
  ]
}

export const mcpSubmissionRepository = new McpSubmissionRepository()

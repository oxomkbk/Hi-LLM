import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import pg from 'pg'

const { Pool } = pg

async function expectDatabaseError(client, action, expectedCode) {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await action()
    assert.fail(`Expected PostgreSQL error ${expectedCode}`)
  }
  catch (error) {
    await client.query(`rollback to savepoint ${savepoint}`)
    assert.equal(error?.code, expectedCode, error instanceof Error ? error.message : String(error))
  }
  finally {
    await client.query(`release savepoint ${savepoint}`)
  }
}

async function verifyBusinessDatabase(connectionString) {
  const pool = new Pool({ connectionString, application_name: 'hillm-nav-security-smoke', max: 1 })
  const client = await pool.connect()
  const actorOne = randomUUID()
  const actorTwo = randomUUID()
  const rootAssessmentId = randomUUID()
  const subjectId = randomUUID()
  const fingerprint = 'a'.repeat(64)
  const inputFingerprint = 'b'.repeat(64)
  const configFingerprint = 'c'.repeat(64)

  try {
    await client.query('begin')
    await client.query(`
      insert into public.app_users (id, email)
      values ($1, $2), ($3, $4)
    `, [actorOne, `security-smoke-${actorOne}@example.test`, actorTwo, `security-smoke-${actorTwo}@example.test`])

    const serviceState = await client.query(`
      select service_enabled, service_state_version,
             service_state_changed_at, service_state_changed_by,
             required_worker_generation
      from public.ds_ai_security_settings
      where id = true
    `)
    assert.equal(typeof serviceState.rows[0]?.service_enabled, 'boolean')
    assert.ok(Number(serviceState.rows[0]?.service_state_version) > 0)
    assert.ok(serviceState.rows[0]?.service_state_changed_at instanceof Date)

    const heartbeatId = `security-smoke-${randomUUID()}`
    await client.query(`
      insert into public.ds_ai_security_worker_heartbeats (
        worker_id, status, observed_service_state_version, worker_generation
      ) values ($1, 'paused', $2, $3)
    `, [
      heartbeatId,
      serviceState.rows[0].service_state_version,
      serviceState.rows[0].required_worker_generation,
    ])
    await expectDatabaseError(client, () => client.query(`
      insert into public.ds_ai_security_worker_heartbeats (
        worker_id, status, observed_service_state_version
      ) values ($1, 'invalid', 0)
    `, [`${heartbeatId}-invalid`]), '23514')
    await expectDatabaseError(client, () => client.query(`
      update public.ds_ai_security_worker_heartbeats
      set observed_service_state_version = -1
      where worker_id = $1
    `, [heartbeatId]), '23514')

    await client.query(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
        trigger, declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_root_id, created_by
      ) values ($1, 'skill', $2, 'Smoke Skill', 'smoke-skill', 'manual', $3, $4, $5, $1, $6)
    `, [rootAssessmentId, subjectId, fingerprint, configFingerprint, `smoke:${rootAssessmentId}`, actorOne])

    await client.query(`
      insert into public.ds_ai_security_subject_states (
        subject_type, subject_id, current_declared_fingerprint,
        ignored_at, ignored_by, ignore_reason
      ) values ('skill', $1, $2, now(), $3, 'Smoke ignore')
    `, [subjectId, fingerprint, actorOne])
    await expectDatabaseError(client, () => client.query(`
      update public.ds_ai_security_subject_states
      set ignored_by = null
      where subject_type = 'skill' and subject_id = $1
    `, [subjectId]), '23514')
    await client.query(`
      update public.ds_ai_security_subject_states
      set ignored_at = null, ignored_by = null, ignore_reason = null
      where subject_type = 'skill' and subject_id = $1
    `, [subjectId])

    await expectDatabaseError(client, () => client.query(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, trigger,
        declared_fingerprint, scanner_config_fingerprint, idempotency_key, retry_root_id
      ) values ($1, 'skill', $2, 'Duplicate active', 'manual', $3, $4, $5, $1)
    `, [randomUUID(), subjectId, fingerprint, configFingerprint, `smoke:${randomUUID()}`]), '23505')

    const legacyHeartbeatId = `${heartbeatId}-legacy`
    await client.query(`
      insert into public.ds_ai_security_worker_heartbeats (
        worker_id, status, observed_service_state_version
      ) values ($1, 'ready', $2)
    `, [legacyHeartbeatId, serviceState.rows[0].service_state_version])
    await expectDatabaseError(client, () => client.query(`
      update public.ds_ai_security_assessments
      set status = 'preparing', worker_id = $2, lease_token = $3,
          lease_version = 1, lease_expires_at = now() + interval '1 minute', started_at = now()
      where id = $1
    `, [rootAssessmentId, legacyHeartbeatId, randomUUID()]), 'P0001')

    await client.query(`
      update public.ds_ai_security_assessments
      set status = 'preparing', worker_id = $2, lease_token = $3,
          lease_version = 1, lease_expires_at = now() + interval '1 minute', started_at = now()
      where id = $1
    `, [rootAssessmentId, heartbeatId, randomUUID()])
    await client.query(`
      update public.ds_ai_security_assessments
      set status = 'running', heartbeat_at = now()
      where id = $1
    `, [rootAssessmentId])
    await client.query(`
      update public.ds_ai_security_assessments
      set status = 'completed', input_fingerprint = $2, coverage = $3::jsonb,
          scanner_name = 'smoke', scanner_version = '1', rules_version = '1',
          original_score = 100, original_grade = 'A', original_verdict = 'passed',
          lease_expires_at = null, finished_at = now()
      where id = $1
    `, [rootAssessmentId, inputFingerprint, JSON.stringify({ level: 'complete', included: [], skipped: [] })])

    await expectDatabaseError(client, () => client.query(
      'update public.ds_ai_security_assessments set status = \'running\', finished_at = null where id = $1',
      [rootAssessmentId],
    ), '23514')

    const retryId = randomUUID()
    await client.query(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, trigger, status,
        declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_of_id, retry_root_id, attempt_number, finished_at
      ) values ($1, 'skill', $2, 'Smoke Skill retry', 'retry', 'failed',
        $3, $4, $5, $6, $6, 2, now())
    `, [retryId, subjectId, fingerprint, configFingerprint, `smoke:${retryId}`, rootAssessmentId])

    await expectDatabaseError(client, () => client.query(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, trigger, status,
        declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_of_id, retry_root_id, attempt_number, finished_at
      ) values ($1, 'skill', $2, 'Duplicate retry', 'retry', 'failed',
        $3, $4, $5, $6, $6, 2, now())
    `, [randomUUID(), randomUUID(), fingerprint, configFingerprint, `smoke:${randomUUID()}`, rootAssessmentId]), '23505')

    const findingId = randomUUID()
    await client.query(`
      insert into public.ds_ai_security_findings (
        id, assessment_id, risk_code, severity, title, description, finding_fingerprint
      ) values ($1, $2, 'T01', 'high', 'Prompt injection', 'Untrusted instruction flow', $3)
    `, [findingId, rootAssessmentId, 'd'.repeat(64)])
    const proposalId = randomUUID()
    await client.query(`
      insert into public.ds_ai_security_finding_reviews (
        id, finding_id, assessment_id, decision, reason, created_by
      ) values ($1, $2, $3, 'false_positive_proposed', 'Smoke proposal reason', $4)
    `, [proposalId, findingId, rootAssessmentId, actorOne])

    await expectDatabaseError(client, () => client.query(`
      insert into public.ds_ai_security_finding_reviews (
        finding_id, assessment_id, decision, review_of_id, reason, created_by
      ) values ($1, $2, 'false_positive_approved', $3, 'Self approval is forbidden', $4)
    `, [findingId, rootAssessmentId, proposalId, actorOne]), '23514')

    await client.query(`
      insert into public.ds_ai_security_finding_reviews (
        finding_id, assessment_id, decision, review_of_id, reason, created_by
      ) values ($1, $2, 'false_positive_approved', $3, 'Second reviewer approval', $4)
    `, [findingId, rootAssessmentId, proposalId, actorTwo])
    await expectDatabaseError(client, () => client.query(`
      insert into public.ds_ai_security_finding_reviews (
        finding_id, assessment_id, decision, review_of_id, reason, created_by
      ) values ($1, $2, 'false_positive_approved', $3, 'Duplicate reviewer approval', $4)
    `, [findingId, rootAssessmentId, proposalId, actorTwo]), '23505')

    const targetSkillId = randomUUID()
    const submissionOneId = randomUUID()
    const submissionTwoId = randomUUID()
    await client.query(`
      insert into public.ds_skills (
        id, slug, name, summary, description, category, source_kind, source_url, author_name
      ) values ($1, $2, 'Target Skill', 'Summary', 'Description', 'testing', 'external_page', $3, 'Smoke')
    `, [targetSkillId, `security-smoke-${targetSkillId}`, `https://example.test/${targetSkillId}`])
    await client.query(`
      insert into public.ds_skill_submissions (
        id, slug, name, summary, description, category, source_kind, source_url, author_name,
        submitter_name, submitted_ip_hash, security_target_id
      ) values
        ($1, $3, 'Submission one', 'Summary', 'Description', 'testing', 'external_page', $5, 'Smoke', 'Smoke', $7, $6),
        ($2, $4, 'Submission two', 'Summary', 'Description', 'testing', 'external_page', $8, 'Smoke', 'Smoke', $7, null)
    `, [
      submissionOneId,
      submissionTwoId,
      `security-smoke-${submissionOneId}`,
      `security-smoke-${submissionTwoId}`,
      `https://example.test/${submissionOneId}`,
      targetSkillId,
      fingerprint,
      `https://example.test/${submissionTwoId}`,
    ])
    await expectDatabaseError(client, () => client.query(
      'update public.ds_skill_submissions set security_target_id = $1 where id = $2',
      [targetSkillId, submissionTwoId],
    ), '23505')

    await client.query(`
      insert into public.ds_mcps (
        id, slug, name, summary, description, category, protocol_version,
        installations, publisher_name, source_url
      ) values ($1, $2, 'Config-only MCP', 'Summary', 'Description', 'testing', '2025-06-18',
        '[{"transport":"stdio","command":"node"}]'::jsonb, 'Smoke', null)
    `, [randomUUID(), `security-smoke-${randomUUID()}`])

    await client.query('rollback')
  }
  catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
  finally {
    client.release()
    await pool.end()
  }
}

async function verifyConcurrentQueueClaim(connectionString) {
  const pool = new Pool({ connectionString, application_name: 'hillm-nav-security-queue-smoke', max: 3 })
  const assessmentId = randomUUID()
  const subjectId = randomUUID()
  const fingerprint = 'e'.repeat(64)
  const configFingerprint = 'f'.repeat(64)
  const workerA = `queue-smoke-worker-${randomUUID()}`
  const workerB = `queue-smoke-worker-${randomUUID()}`

  try {
    const serviceState = await pool.query(`
      select service_state_version, required_worker_generation
      from public.ds_ai_security_settings
      where id = true
    `)
    await pool.query(`
      insert into public.ds_ai_security_worker_heartbeats (
        worker_id, status, observed_service_state_version, worker_generation
      ) values
        ($1, 'ready', $3, $4),
        ($2, 'ready', $3, $4)
    `, [
      workerA,
      workerB,
      serviceState.rows[0].service_state_version,
      serviceState.rows[0].required_worker_generation,
    ])
    await pool.query(`
      insert into public.ds_ai_security_assessments (
        id, subject_type, subject_id, subject_name_snapshot, subject_slug_snapshot,
        trigger, declared_fingerprint, scanner_config_fingerprint, idempotency_key,
        retry_root_id
      ) values ($1, 'skill', $2, 'Concurrent claim', 'concurrent-claim',
        'manual', $3, $4, $5, $1)
    `, [assessmentId, subjectId, fingerprint, configFingerprint, `smoke-claim:${assessmentId}`])

    const claim = async (workerId) => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await client.query(`
          with candidates as (
            select id
            from public.ds_ai_security_assessments
            where status = 'queued' and next_run_at <= now()
              and id = $1
            order by next_run_at, created_at, id
            for update skip locked
            limit 1
          )
          update public.ds_ai_security_assessments assessment
          set status = 'preparing', worker_id = $2,
              lease_token = gen_random_uuid(),
              lease_version = assessment.lease_version + 1,
              lease_expires_at = now() + make_interval(secs => 60),
              heartbeat_at = now(), started_at = now()
          from candidates
          where assessment.id = candidates.id
          returning assessment.id, assessment.worker_id, assessment.lease_token,
                    assessment.lease_version, assessment.lease_expires_at
        `, [assessmentId, workerId])
        await client.query('commit')
        return result.rows
      }
      catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      }
      finally {
        client.release()
      }
    }

    const claims = (await Promise.all([
      claim(workerA),
      claim(workerB),
    ])).flat()
    assert.equal(claims.length, 1, 'one queued assessment must be claimed exactly once')
    assert.equal(claims[0].id, assessmentId)
    assert.equal(Number(claims[0].lease_version), 1)
    assert.ok(claims[0].lease_token)
    assert.ok(claims[0].lease_expires_at > new Date())
  }
  finally {
    await pool.query('delete from public.ds_ai_security_assessments where id = $1', [assessmentId]).catch(() => undefined)
    await pool.query('delete from public.ds_ai_security_worker_heartbeats where worker_id = any($1::text[])', [[workerA, workerB]]).catch(() => undefined)
    await pool.end()
  }
}

async function verifyControlDatabase(connectionString) {
  const pool = new Pool({ connectionString, application_name: 'hillm-nav-security-audit-smoke', max: 1 })
  const client = await pool.connect()
  const eventId = randomUUID()

  try {
    await client.query('begin')
    await client.query(`
      insert into control.audit_logs (
        external_event_id, action, resource_type, resource_id, success, code
      ) values ($1, 'security.smoke', 'assessment', $2, true, 'OK')
    `, [eventId, randomUUID()])
    await expectDatabaseError(client, () => client.query(`
      insert into control.audit_logs (
        external_event_id, action, resource_type, resource_id, success, code
      ) values ($1, 'security.smoke', 'assessment', $2, true, 'OK')
    `, [eventId, randomUUID()]), '23505')
    await client.query('rollback')
  }
  catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
  finally {
    client.release()
    await pool.end()
  }
}

async function verifySecuritySubjectCatalog(connectionString) {
  const pool = new Pool({ connectionString, application_name: 'hillm-nav-security-catalog-smoke', max: 1 })
  try {
    const catalog = await pool.query(`
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
        select subjects.subject_type,
               coalesce(state.report_state, 'unassessed') as report_state,
               state.ignored_at,
               state.active_assessment_id,
               settings.adapter_versions ? case
                 when subjects.subject_type in ('skill', 'skill_submission') then 'skill'
                 when subjects.subject_type in ('mcp', 'mcp_submission') then 'mcp'
                 else 'prompt'
               end as adapter_available
        from subjects
        cross join public.ds_ai_security_settings settings
        left join public.ds_ai_security_subject_states state
          on state.subject_type = subjects.subject_type and state.subject_id = subjects.id
        where settings.id = true
      )
      select subject_type, count(*)::int as count,
             bool_and(adapter_available) as adapter_available
      from catalog
      group by subject_type
    `)
    const expected = await pool.query(`
      select
        (select count(*)::int from public.ds_skills) as skill,
        (select count(*)::int from public.ds_skill_submissions submission
          where submission.status <> 'approved'
            and not exists (
              select 1 from public.ds_skills skill
              where skill.origin_submission_id = submission.id
                 or skill.id = submission.security_target_id
            )) as skill_submission,
        (select count(*)::int from public.ds_mcps) as mcp,
        (select count(*)::int from public.ds_mcp_submissions submission
          where submission.status <> 'approved'
            and not exists (
              select 1 from public.ds_mcps mcp
              where mcp.origin_submission_id = submission.id
                 or mcp.id = submission.security_target_id
                 or mcp.id = submission.approved_mcp_id
            )) as mcp_submission,
        (select count(*)::int from public.ds_prompts) as prompt
    `)
    const actualCounts = Object.fromEntries(catalog.rows.map(row => [row.subject_type, row.count]))
    for (const subjectType of ['skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt']) {
      assert.equal(actualCounts[subjectType] ?? 0, expected.rows[0][subjectType], `${subjectType} must be present in the assessment catalog`)
    }

    const settings = await pool.query(`
      select adapter_versions ? 'skill' as skill,
             adapter_versions ? 'mcp' as mcp,
             adapter_versions ? 'prompt' as prompt
      from public.ds_ai_security_settings
      where id = true
    `)
    assert.deepEqual(settings.rows[0], { mcp: true, prompt: true, skill: true })
  }
  finally {
    await pool.end()
  }
}

const businessUrl = process.env.BUSINESS_DATABASE_URL
const controlUrl = process.env.CONTROL_DATABASE_URL

assert.ok(businessUrl, 'BUSINESS_DATABASE_URL is required')
assert.ok(controlUrl, 'CONTROL_DATABASE_URL is required')

await verifyBusinessDatabase(businessUrl)
await verifyConcurrentQueueClaim(businessUrl)
await verifySecuritySubjectCatalog(businessUrl)
await verifyControlDatabase(controlUrl)
console.log('AI security database smoke checks passed')

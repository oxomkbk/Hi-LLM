alter table public.ds_ai_security_subject_states
  add column ignored_at timestamptz,
  add column ignored_by uuid references public.app_users(id) on delete set null,
  add column ignore_reason text
    check (ignore_reason is null or char_length(ignore_reason) <= 500),
  add constraint ds_ai_security_subject_states_ignore_check
    check (
      (ignored_at is null and ignored_by is null and ignore_reason is null)
      or (ignored_at is not null and ignored_by is not null)
    );

create index ds_ai_security_subject_states_ignored_idx
  on public.ds_ai_security_subject_states (ignored_at desc, subject_type, subject_id)
  where ignored_at is not null;

-- Complete links written by earlier approval code so the published record can
-- become the single canonical content/security object.
update public.ds_skills skill
set origin_submission_id = submission.id
from public.ds_skill_submissions submission
where skill.origin_submission_id is null
  and submission.security_target_id = skill.id
  and not exists (
    select 1 from public.ds_skills linked
    where linked.origin_submission_id = submission.id
  );

with candidates as (
  select submission.id as submission_id, (array_agg(skill.id order by skill.id))[1] as skill_id
  from public.ds_skill_submissions submission
  join public.ds_skills skill
    on lower(skill.source_url) = lower(submission.source_url)
       and lower(skill.slug) = lower(submission.slug)
  where submission.status = 'approved'
    and submission.security_target_id is null
    and skill.origin_submission_id is null
  group by submission.id
  having count(*) = 1
)
update public.ds_skills skill
set origin_submission_id = candidates.submission_id
from candidates
where skill.id = candidates.skill_id;

update public.ds_skill_submissions submission
set security_target_id = skill.id,
    security_review_status = 'ready',
    security_pending_reason = null
from public.ds_skills skill
where skill.origin_submission_id = submission.id
  and (
    submission.security_target_id is distinct from skill.id
    or submission.security_review_status <> 'ready'
    or submission.security_pending_reason is not null
  );

update public.ds_mcps mcp
set origin_submission_id = submission.id
from public.ds_mcp_submissions submission
where mcp.origin_submission_id is null
  and (submission.security_target_id = mcp.id or submission.approved_mcp_id = mcp.id)
  and not exists (
    select 1 from public.ds_mcps linked
    where linked.origin_submission_id = submission.id
  );

with candidates as (
  select submission.id as submission_id, (array_agg(mcp.id order by mcp.id))[1] as mcp_id
  from public.ds_mcp_submissions submission
  join public.ds_mcps mcp
    on lower(mcp.slug) = lower(submission.slug)
       and (
         submission.source_url is null
         or mcp.source_url is null
         or lower(mcp.source_url) = lower(submission.source_url)
       )
  where submission.status = 'approved'
    and submission.security_target_id is null
    and submission.approved_mcp_id is null
    and mcp.origin_submission_id is null
  group by submission.id
  having count(*) = 1
)
update public.ds_mcps mcp
set origin_submission_id = candidates.submission_id
from candidates
where mcp.id = candidates.mcp_id;

update public.ds_mcp_submissions submission
set security_target_id = mcp.id,
    approved_mcp_id = mcp.id,
    security_review_status = 'ready',
    security_pending_reason = null
from public.ds_mcps mcp
where mcp.origin_submission_id = submission.id
  and (
    submission.security_target_id is distinct from mcp.id
    or submission.approved_mcp_id is distinct from mcp.id
    or submission.security_review_status <> 'ready'
    or submission.security_pending_reason is not null
  );

comment on column public.ds_ai_security_subject_states.ignored_at is
  'Administrator opt-out from the assessment catalog; reports and content are retained.';

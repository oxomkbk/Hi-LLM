create table public.ds_ai_security_settings (
  id boolean primary key default true check (id = true),
  skill_mode text not null default 'off' check (skill_mode in ('off', 'observe', 'warn', 'enforce')),
  mcp_mode text not null default 'off' check (mcp_mode in ('off', 'observe', 'warn', 'enforce')),
  prompt_mode text not null default 'off' check (prompt_mode in ('off', 'observe', 'warn', 'enforce')),
  public_show_score boolean not null default true,
  public_show_grade boolean not null default true,
  public_show_risk_counts boolean not null default true,
  public_show_summary boolean not null default true,
  worker_concurrency smallint not null default 1 check (worker_concurrency between 1 and 4),
  job_timeout_seconds integer not null default 600 check (job_timeout_seconds between 60 and 3600),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 5),
  max_queue_size integer not null default 1000 check (max_queue_size between 1 and 10000),
  daily_llm_budget integer not null default 500 check (daily_llm_budget between 1 and 100000),
  max_repository_bytes bigint not null default 104857600 check (max_repository_bytes between 1048576 and 524288000),
  max_materialized_bytes bigint not null default 209715200 check (max_materialized_bytes between 1048576 and 1073741824),
  max_files integer not null default 5000 check (max_files between 1 and 20000),
  max_file_bytes bigint not null default 2097152 check (max_file_bytes between 1024 and 52428800),
  max_text_bytes bigint not null default 31457280 check (max_text_bytes between 1024 and 209715200),
  max_archive_depth smallint not null default 32 check (max_archive_depth between 1 and 64),
  report_retention_days integer not null default 365 check (report_retention_days between 30 and 3650),
  allowed_source_hosts text[] not null default array['github.com', 'gitlab.com']::text[],
  adapter_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(adapter_versions) = 'object'),
  required_scanner_config_fingerprints jsonb not null default '{}'::jsonb
    check (jsonb_typeof(required_scanner_config_fingerprints) = 'object'),
  confirmed_llm_identity jsonb check (confirmed_llm_identity is null or jsonb_typeof(confirmed_llm_identity) = 'object'),
  settings_version bigint not null default 1 check (settings_version > 0),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ds_ai_security_settings (id)
values (true)
on conflict (id) do nothing;

create table public.ds_ai_security_assessments (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt')),
  subject_id uuid not null,
  subject_name_snapshot text not null check (char_length(subject_name_snapshot) between 1 and 180),
  subject_slug_snapshot text check (subject_slug_snapshot is null or char_length(subject_slug_snapshot) between 1 and 180),
  trigger text not null check (trigger in ('manual', 'batch', 'publish_gate', 'retry')),
  status text not null default 'queued' check (status in ('queued', 'preparing', 'running', 'completed', 'failed', 'cancelled')),
  declared_fingerprint text not null check (declared_fingerprint ~ '^[0-9a-f]{64}$'),
  input_fingerprint text check (input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'),
  scanner_config_fingerprint text not null check (scanner_config_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 180),
  scanner_name text check (scanner_name is null or char_length(scanner_name) between 1 and 100),
  scanner_version text check (scanner_version is null or char_length(scanner_version) between 1 and 100),
  rules_version text check (rules_version is null or char_length(rules_version) between 1 and 100),
  source_revision text check (source_revision is null or char_length(source_revision) between 1 and 255),
  coverage jsonb check (coverage is null or jsonb_typeof(coverage) = 'object'),
  engine_score smallint check (engine_score is null or engine_score between 0 and 100),
  original_score smallint check (original_score is null or original_score between 0 and 100),
  original_grade text check (original_grade is null or original_grade in ('A', 'B', 'C', 'D')),
  original_verdict text check (original_verdict is null or original_verdict in ('passed', 'review_required', 'blocked')),
  original_critical_count integer not null default 0 check (original_critical_count >= 0),
  original_high_count integer not null default 0 check (original_high_count >= 0),
  original_medium_count integer not null default 0 check (original_medium_count >= 0),
  original_low_count integer not null default 0 check (original_low_count >= 0),
  original_info_count integer not null default 0 check (original_info_count >= 0),
  summary text check (summary is null or char_length(summary) <= 2000),
  raw_report_file_id uuid references public.file_objects(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null,
  worker_id text check (worker_id is null or char_length(worker_id) between 1 and 180),
  lease_token uuid,
  lease_version bigint not null default 0 check (lease_version >= 0),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  retry_of_id uuid references public.ds_ai_security_assessments(id) on delete restrict,
  retry_root_id uuid not null references public.ds_ai_security_assessments(id) on delete restrict,
  attempt_number smallint not null default 1 check (attempt_number between 1 and 5),
  error_code text check (error_code is null or char_length(error_code) between 1 and 100),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check ((attempt_number = 1 and retry_of_id is null) or (attempt_number > 1 and retry_of_id is not null)),
  check (status <> 'completed' or (
    input_fingerprint is not null and coverage is not null and original_score is not null
    and original_grade is not null and original_verdict is not null and finished_at is not null
  )),
  check (status not in ('failed', 'cancelled') or finished_at is not null),
  check (status in ('queued', 'preparing', 'running') or lease_expires_at is null)
);

create unique index ds_ai_security_assessments_active_subject_idx
  on public.ds_ai_security_assessments (subject_type, subject_id)
  where status in ('queued', 'preparing', 'running');
create unique index ds_ai_security_assessments_retry_attempt_idx
  on public.ds_ai_security_assessments (retry_root_id, attempt_number);
create index ds_ai_security_assessments_claim_idx
  on public.ds_ai_security_assessments (created_at, id)
  where status = 'queued';
create index ds_ai_security_assessments_lease_idx
  on public.ds_ai_security_assessments (lease_expires_at, id)
  where status in ('preparing', 'running');
create index ds_ai_security_assessments_subject_history_idx
  on public.ds_ai_security_assessments (subject_type, subject_id, created_at desc, id);

create table public.ds_ai_security_subject_states (
  subject_type text not null check (subject_type in ('skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt')),
  subject_id uuid not null,
  latest_assessment_id uuid references public.ds_ai_security_assessments(id) on delete set null,
  latest_attempt_id uuid references public.ds_ai_security_assessments(id) on delete set null,
  active_assessment_id uuid references public.ds_ai_security_assessments(id) on delete set null,
  assessed_declared_fingerprint text check (assessed_declared_fingerprint is null or assessed_declared_fingerprint ~ '^[0-9a-f]{64}$'),
  current_declared_fingerprint text not null check (current_declared_fingerprint ~ '^[0-9a-f]{64}$'),
  assessed_source_revision text check (assessed_source_revision is null or char_length(assessed_source_revision) between 1 and 255),
  scanner_config_fingerprint text check (scanner_config_fingerprint is null or scanner_config_fingerprint ~ '^[0-9a-f]{64}$'),
  report_state text not null default 'unassessed'
    check (report_state in ('unassessed', 'passed', 'review_required', 'blocked', 'failed', 'stale')),
  score smallint check (score is null or score between 0 and 100),
  grade text check (grade is null or grade in ('A', 'B', 'C', 'D')),
  verdict text check (verdict is null or verdict in ('passed', 'review_required', 'blocked')),
  critical_count integer not null default 0 check (critical_count >= 0),
  high_count integer not null default 0 check (high_count >= 0),
  medium_count integer not null default 0 check (medium_count >= 0),
  low_count integer not null default 0 check (low_count >= 0),
  info_count integer not null default 0 check (info_count >= 0),
  fresh_until timestamptz,
  assessed_at timestamptz,
  stale_at timestamptz,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 0 check (row_version >= 0),
  public_visible boolean not null default true,
  primary key (subject_type, subject_id),
  check (
    (report_state in ('unassessed', 'failed', 'stale') and score is null and grade is null and verdict is null)
    or
    (report_state in ('passed', 'review_required', 'blocked') and score is not null and grade is not null and verdict = report_state)
  )
);

create index ds_ai_security_subject_states_report_idx
  on public.ds_ai_security_subject_states (subject_type, report_state, updated_at desc);
create index ds_ai_security_subject_states_active_idx
  on public.ds_ai_security_subject_states (active_assessment_id)
  where active_assessment_id is not null;
create index ds_ai_security_subject_states_freshness_idx
  on public.ds_ai_security_subject_states (fresh_until, subject_type, subject_id)
  where fresh_until is not null and report_state in ('passed', 'review_required', 'blocked');

create table public.ds_ai_security_assessment_bindings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.ds_ai_security_assessments(id) on delete cascade,
  subject_type text not null check (subject_type in ('skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt')),
  subject_id uuid not null,
  binding_kind text not null check (binding_kind in ('original', 'reused_on_approval')),
  bound_declared_fingerprint text not null check (bound_declared_fingerprint ~ '^[0-9a-f]{64}$'),
  bound_input_fingerprint text not null check (bound_input_fingerprint ~ '^[0-9a-f]{64}$'),
  bound_by uuid references public.app_users(id) on delete set null,
  bound_at timestamptz not null default now(),
  unique (assessment_id, subject_type, subject_id)
);

create index ds_ai_security_assessment_bindings_subject_idx
  on public.ds_ai_security_assessment_bindings (subject_type, subject_id, bound_at desc);

create table public.ds_ai_security_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.ds_ai_security_assessments(id) on delete cascade,
  risk_code text not null check (risk_code ~ '^[A-Z][A-Z0-9_]{1,99}$'),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 4000),
  recommendation text check (recommendation is null or char_length(recommendation) <= 4000),
  artifact_path text check (artifact_path is null or char_length(artifact_path) <= 1000),
  start_line integer check (start_line is null or start_line > 0),
  end_line integer check (end_line is null or end_line > 0),
  evidence_redacted text check (evidence_redacted is null or char_length(evidence_redacted) <= 8000),
  public_summary text check (public_summary is null or char_length(public_summary) <= 500),
  finding_fingerprint text not null check (finding_fingerprint ~ '^[0-9a-f]{64}$'),
  public_visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (assessment_id, finding_fingerprint),
  unique (id, assessment_id),
  check (end_line is null or start_line is not null),
  check (end_line is null or end_line >= start_line)
);

create index ds_ai_security_findings_assessment_severity_idx
  on public.ds_ai_security_findings (assessment_id, severity, created_at, id);

create table public.ds_ai_security_finding_reviews (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  assessment_id uuid not null,
  decision text not null check (decision in ('false_positive', 'false_positive_proposed', 'false_positive_approved', 'reopen')),
  review_of_id uuid,
  reason text not null check (char_length(reason) between 10 and 2000),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, finding_id, assessment_id),
  foreign key (finding_id, assessment_id)
    references public.ds_ai_security_findings(id, assessment_id) on delete cascade,
  foreign key (review_of_id, finding_id, assessment_id)
    references public.ds_ai_security_finding_reviews(id, finding_id, assessment_id) on delete restrict,
  check (
    (decision in ('false_positive', 'false_positive_proposed') and review_of_id is null)
    or
    (decision in ('false_positive_approved', 'reopen') and review_of_id is not null)
  )
);

create unique index ds_ai_security_finding_reviews_approval_idx
  on public.ds_ai_security_finding_reviews (review_of_id)
  where decision = 'false_positive_approved';
create unique index ds_ai_security_finding_reviews_reopen_idx
  on public.ds_ai_security_finding_reviews (review_of_id)
  where decision = 'reopen';
create index ds_ai_security_finding_reviews_finding_idx
  on public.ds_ai_security_finding_reviews (finding_id, created_at, id);

create table public.ds_ai_security_overrides (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('skill', 'skill_submission', 'mcp', 'mcp_submission', 'prompt')),
  subject_id uuid not null,
  assessment_id uuid not null references public.ds_ai_security_assessments(id) on delete cascade,
  basis_attempt_id uuid not null references public.ds_ai_security_assessments(id) on delete restrict,
  kind text not null check (kind in ('warn_acknowledgement', 'accept_medium', 'temporary_high')),
  reason text not null check (char_length(reason) between 10 and 2000),
  declared_fingerprint text not null check (declared_fingerprint ~ '^[0-9a-f]{64}$'),
  input_fingerprint text check (input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'),
  scanner_config_fingerprint text not null check (scanner_config_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.app_users(id) on delete restrict,
  check (expires_at is null or expires_at > created_at),
  check (kind <> 'temporary_high' or (expires_at is not null and expires_at <= created_at + interval '30 days')),
  check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null))
);

create unique index ds_ai_security_overrides_active_idx
  on public.ds_ai_security_overrides (
    subject_type, subject_id, assessment_id, declared_fingerprint,
    scanner_config_fingerprint, kind
  )
  where revoked_at is null;
create index ds_ai_security_overrides_subject_idx
  on public.ds_ai_security_overrides (subject_type, subject_id, created_at desc);
create index ds_ai_security_overrides_expiry_idx
  on public.ds_ai_security_overrides (expires_at, id)
  where revoked_at is null and expires_at is not null;

create table public.ds_ai_security_audit_outbox (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 120),
  actor_user_id uuid references public.app_users(id) on delete set null,
  resource_type text not null check (char_length(resource_type) between 1 and 100),
  resource_id text check (resource_id is null or char_length(resource_id) <= 180),
  success boolean not null,
  code text not null check (char_length(code) between 1 and 100),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100)
);

create index ds_ai_security_audit_outbox_delivery_idx
  on public.ds_ai_security_audit_outbox (created_at, id)
  where delivered_at is null;

alter table public.ds_skill_submissions
  drop constraint ds_skill_submissions_status_check,
  add constraint ds_skill_submissions_status_check
    check (status in ('pending', 'pending_security', 'approved', 'rejected')),
  add column security_target_id uuid unique references public.ds_skills(id) on delete set null,
  add column security_review_status text not null default 'not_required'
    check (security_review_status in ('not_required', 'pending_security', 'ready')),
  add column security_pending_reason text
    check (security_pending_reason is null or security_pending_reason in ('requires_rescan', 'requires_target_override'));

alter table public.ds_skills
  add column origin_submission_id uuid unique references public.ds_skill_submissions(id) on delete set null;

drop index public.ds_skill_submissions_pending_source_url_idx;
drop index public.ds_skill_submissions_pending_slug_idx;
create unique index ds_skill_submissions_pending_source_url_idx
  on public.ds_skill_submissions (source_url)
  where status in ('pending', 'pending_security');
create unique index ds_skill_submissions_pending_slug_idx
  on public.ds_skill_submissions (slug)
  where status in ('pending', 'pending_security');

alter table public.ds_mcp_submissions
  drop constraint ds_mcp_submissions_status_check,
  add constraint ds_mcp_submissions_status_check
    check (status in ('pending', 'pending_security', 'approved', 'rejected')),
  alter column source_url drop not null,
  add column security_target_id uuid unique references public.ds_mcps(id) on delete set null,
  add column security_review_status text not null default 'not_required'
    check (security_review_status in ('not_required', 'pending_security', 'ready')),
  add column security_pending_reason text
    check (security_pending_reason is null or security_pending_reason in ('requires_rescan', 'requires_target_override'));

alter table public.ds_mcps
  alter column source_url drop not null,
  add column origin_submission_id uuid unique references public.ds_mcp_submissions(id) on delete set null;

drop index public.ds_mcps_source_unique;
drop index public.ds_mcp_submissions_pending_slug_unique;
drop index public.ds_mcp_submissions_pending_source_unique;
create unique index ds_mcps_source_unique
  on public.ds_mcps (lower(source_url))
  where source_url is not null;
create unique index ds_mcp_submissions_pending_slug_unique
  on public.ds_mcp_submissions (lower(slug))
  where status in ('pending', 'pending_security');
create unique index ds_mcp_submissions_pending_source_unique
  on public.ds_mcp_submissions (lower(source_url))
  where status in ('pending', 'pending_security') and source_url is not null;

create or replace function app_private.enforce_ai_security_assessment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'failed', 'cancelled') then
    if new is distinct from old then
      raise exception 'terminal security assessment is immutable' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status <> old.status and not (
    (old.status = 'queued' and new.status in ('preparing', 'failed', 'cancelled'))
    or (old.status = 'preparing' and new.status in ('running', 'failed', 'cancelled'))
    or (old.status = 'running' and new.status in ('completed', 'failed', 'cancelled'))
  ) then
    raise exception 'invalid security assessment transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function app_private.validate_ai_security_finding_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_decision text;
  target_actor uuid;
begin
  if new.decision not in ('false_positive_approved', 'reopen') then
    return new;
  end if;

  select decision, created_by
    into target_decision, target_actor
  from public.ds_ai_security_finding_reviews
  where id = new.review_of_id
    and finding_id = new.finding_id
    and assessment_id = new.assessment_id;

  if not found then
    raise exception 'review target does not exist in this assessment finding' using errcode = '23503';
  end if;

  if new.decision = 'false_positive_approved' then
    if target_decision <> 'false_positive_proposed' then
      raise exception 'approval must reference a false-positive proposal' using errcode = '23514';
    end if;
    if target_actor = new.created_by then
      raise exception 'false-positive proposal cannot be self-approved' using errcode = '23514';
    end if;
  elsif target_decision not in ('false_positive', 'false_positive_approved') then
    raise exception 'reopen must reference an effective false-positive decision' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function app_private.prevent_ai_security_fact_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'security assessment facts are append-only' using errcode = '23514';
end;
$$;

create trigger ds_ai_security_settings_set_updated_at
before update on public.ds_ai_security_settings
for each row execute function app_private.set_updated_at();

create trigger ds_ai_security_subject_states_set_updated_at
before update on public.ds_ai_security_subject_states
for each row execute function app_private.set_updated_at();

create trigger ds_ai_security_assessments_transition
before update on public.ds_ai_security_assessments
for each row execute function app_private.enforce_ai_security_assessment_transition();

create trigger ds_ai_security_findings_immutable
before update on public.ds_ai_security_findings
for each row execute function app_private.prevent_ai_security_fact_update();

create trigger ds_ai_security_finding_reviews_validate
before insert on public.ds_ai_security_finding_reviews
for each row execute function app_private.validate_ai_security_finding_review();

create trigger ds_ai_security_finding_reviews_immutable
before update on public.ds_ai_security_finding_reviews
for each row execute function app_private.prevent_ai_security_fact_update();

revoke all on public.ds_ai_security_settings from public;
revoke all on public.ds_ai_security_subject_states from public;
revoke all on public.ds_ai_security_assessments from public;
revoke all on public.ds_ai_security_assessment_bindings from public;
revoke all on public.ds_ai_security_findings from public;
revoke all on public.ds_ai_security_finding_reviews from public;
revoke all on public.ds_ai_security_overrides from public;
revoke all on public.ds_ai_security_audit_outbox from public;
revoke all on all functions in schema app_private from public;

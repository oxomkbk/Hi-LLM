alter table public.ds_ai_security_assessments
  add column execution_profile text not null default 'configured',
  add column batch_id uuid,
  add constraint ds_ai_security_assessments_execution_profile_check
    check (execution_profile in ('configured', 'local_deterministic')),
  add constraint ds_ai_security_assessments_execution_batch_check
    check (
      (execution_profile = 'configured' and batch_id is null)
      or (execution_profile = 'local_deterministic' and batch_id is not null)
    );

create index ds_ai_security_assessments_profile_claim_idx
  on public.ds_ai_security_assessments (
    execution_profile,
    batch_id,
    next_run_at,
    created_at,
    id
  )
  where status = 'queued';

create or replace function app_private.enforce_ai_security_assessment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.execution_profile is distinct from old.execution_profile
    or new.batch_id is distinct from old.batch_id then
    raise exception 'security assessment execution identity is immutable' using errcode = '23514';
  end if;

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

with current_settings as (
  select
    adapter_versions,
    required_scanner_config_fingerprints,
    coalesce(adapter_versions #>> '{mcp,scanner}', '') = 'better-nav-mcp-trust@2' as mcp_changed,
    coalesce(adapter_versions #>> '{prompt,scanner}', '') = 'better-nav-prompt-trust@2' as prompt_changed
  from public.ds_ai_security_settings
  where id = true
  for update
), changed as (
  update public.ds_ai_security_settings settings
  set adapter_versions = case when current.prompt_changed then jsonb_set(
        case when current.mcp_changed then jsonb_set(
          settings.adapter_versions,
          '{mcp,scanner}',
          to_jsonb('hillm-nav-mcp-trust@2'::text),
          true
        ) else settings.adapter_versions end,
        '{prompt,scanner}',
        to_jsonb('hillm-nav-prompt-trust@2'::text),
        true
      ) else case when current.mcp_changed then jsonb_set(
        settings.adapter_versions,
        '{mcp,scanner}',
        to_jsonb('hillm-nav-mcp-trust@2'::text),
        true
      ) else settings.adapter_versions end end,
      required_scanner_config_fingerprints = case when current.prompt_changed then jsonb_set(
        case when current.mcp_changed then jsonb_set(
          settings.required_scanner_config_fingerprints,
          '{mcp}',
          to_jsonb(encode(digest(
            coalesce(settings.required_scanner_config_fingerprints ->> 'mcp', '')
              || ':hillm-nav-mcp-trust@2',
            'sha256'
          ), 'hex')),
          true
        ) else settings.required_scanner_config_fingerprints end,
        '{prompt}',
        to_jsonb(encode(digest(
          coalesce(settings.required_scanner_config_fingerprints ->> 'prompt', '')
            || ':hillm-nav-prompt-trust@2',
            'sha256'
          ), 'hex')),
        true
      ) else case when current.mcp_changed then jsonb_set(
        settings.required_scanner_config_fingerprints,
        '{mcp}',
        to_jsonb(encode(digest(
          coalesce(settings.required_scanner_config_fingerprints ->> 'mcp', '')
            || ':hillm-nav-mcp-trust@2',
          'sha256'
        ), 'hex')),
        true
      ) else settings.required_scanner_config_fingerprints end end,
      service_state_version = settings.service_state_version + 1,
      service_state_changed_at = now(),
      service_state_changed_by = null,
      settings_version = settings.settings_version + 1,
      updated_at = now()
  from current_settings current
  where settings.id = true
    and (current.mcp_changed or current.prompt_changed)
  returning current.mcp_changed, current.prompt_changed
)
update public.ds_ai_security_subject_states state
set report_state = case when latest_assessment_id is null then 'unassessed' else 'stale' end,
    score = null,
    grade = null,
    verdict = null,
    stale_at = case when latest_assessment_id is null then stale_at else now() end,
    row_version = row_version + 1,
    updated_at = now()
from changed
where (changed.mcp_changed and state.subject_type in ('mcp', 'mcp_submission'))
   or (changed.prompt_changed and state.subject_type = 'prompt');

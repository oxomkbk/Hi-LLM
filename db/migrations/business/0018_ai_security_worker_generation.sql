alter table public.ds_ai_security_settings
  add column required_worker_generation text not null
    default 'better-nav-security-worker@2026-08-22.1'
    check (char_length(required_worker_generation) between 8 and 120);

alter table public.ds_ai_security_worker_heartbeats
  add column worker_generation text not null default 'legacy'
    check (char_length(worker_generation) between 1 and 120);

update public.ds_ai_security_settings
set required_worker_generation = 'better-nav-security-worker@2026-08-22.1',
    service_state_version = service_state_version + 1,
    service_state_changed_at = now(),
    service_state_changed_by = null,
    updated_at = now()
where id = true;

create or replace function public.guard_ai_security_worker_claim()
returns trigger
language plpgsql
as $$
declare
  worker_is_current boolean;
begin
  if old.status = 'queued' and new.status = 'preparing' then
    select exists (
      select 1
      from public.ds_ai_security_worker_heartbeats heartbeat
      join public.ds_ai_security_settings settings on settings.id = true
      where heartbeat.worker_id = new.worker_id
        and heartbeat.worker_generation = settings.required_worker_generation
        and heartbeat.observed_service_state_version = settings.service_state_version
        and heartbeat.last_seen_at >= now() - interval '75 seconds'
    ) into worker_is_current;

    if not worker_is_current then
      raise exception using
        errcode = 'P0001',
        message = 'SECURITY_WORKER_GENERATION_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ds_ai_security_worker_claim_guard
  on public.ds_ai_security_assessments;

create trigger ds_ai_security_worker_claim_guard
before update of status, worker_id on public.ds_ai_security_assessments
for each row
execute function public.guard_ai_security_worker_claim();

comment on column public.ds_ai_security_settings.required_worker_generation is
  'Only workers from this build generation may claim queued assessments.';

comment on column public.ds_ai_security_worker_heartbeats.worker_generation is
  'Build generation advertised by the worker; legacy workers are fenced from claiming jobs.';

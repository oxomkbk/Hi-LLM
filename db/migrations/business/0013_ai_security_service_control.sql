alter table public.ds_ai_security_settings
  add column service_enabled boolean not null default false,
  add column service_state_version bigint not null default 1
    check (service_state_version > 0),
  add column service_state_changed_at timestamptz not null default now(),
  add column service_state_changed_by uuid
    references public.app_users(id) on delete set null;

alter table public.ds_ai_security_worker_heartbeats
  drop constraint ds_ai_security_worker_heartbeats_status_check,
  add constraint ds_ai_security_worker_heartbeats_status_check
    check (status in ('ready', 'degraded', 'paused')),
  add column observed_service_state_version bigint not null default 0
    check (observed_service_state_version >= 0);

comment on column public.ds_ai_security_settings.service_enabled is
  'Global desired state for creating and claiming AI security assessments.';

comment on column public.ds_ai_security_settings.service_state_version is
  'Monotonic desired-state version used to prevent workers from reusing stale readiness checks.';

comment on column public.ds_ai_security_worker_heartbeats.observed_service_state_version is
  'Security service state version observed by the worker during its latest readiness check.';

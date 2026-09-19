alter table public.ds_ai_security_assessments
  add column next_run_at timestamptz not null default now(),
  add column cancel_requested_at timestamptz,
  add column cancel_requested_by uuid references public.app_users(id) on delete set null;

drop index public.ds_ai_security_assessments_claim_idx;
create index ds_ai_security_assessments_claim_idx
  on public.ds_ai_security_assessments (next_run_at, created_at, id)
  where status = 'queued';

create index ds_ai_security_assessments_cancel_idx
  on public.ds_ai_security_assessments (cancel_requested_at, id)
  where status in ('preparing', 'running') and cancel_requested_at is not null;

alter table public.ds_ai_security_assessments
  add constraint ds_ai_security_assessments_cancel_request_check
  check (
    (cancel_requested_at is null and cancel_requested_by is null)
    or
    (cancel_requested_at is not null and cancel_requested_by is not null)
  );

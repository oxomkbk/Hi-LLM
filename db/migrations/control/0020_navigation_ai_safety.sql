create table if not exists control.navigation_ai_security_settings (
  id boolean primary key default true check (id = true),
  abuse_protection_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into control.navigation_ai_security_settings (id)
values (true)
on conflict (id) do nothing;

alter table control.navigation_ai_request_events
  add column if not exists request_fingerprint text;

create index if not exists navigation_ai_request_events_duplicate_idx
  on control.navigation_ai_request_events (bucket_key, request_fingerprint, created_at desc)
  where bucket_type = 'visitor' and request_fingerprint is not null;

revoke all on control.navigation_ai_security_settings from public;

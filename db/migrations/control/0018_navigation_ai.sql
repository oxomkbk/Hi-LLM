alter table control.llm_settings
  add column if not exists navigation_ai_enabled boolean not null default false;

create table if not exists control.navigation_ai_request_events (
  id bigint generated always as identity primary key,
  bucket_type text not null check (bucket_type in ('global', 'visitor')),
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists navigation_ai_request_events_bucket_idx
  on control.navigation_ai_request_events (bucket_type, bucket_key, created_at desc);

create index if not exists navigation_ai_request_events_created_idx
  on control.navigation_ai_request_events (created_at);

revoke all on control.navigation_ai_request_events from public;
revoke all on all sequences in schema control from public;

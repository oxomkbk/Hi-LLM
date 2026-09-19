create table public.ds_ai_security_worker_heartbeats (
  worker_id text primary key,
  status text not null check (status in ('ready', 'degraded')),
  ready_subject_types text[] not null default '{}'::text[],
  issues jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (ready_subject_types <@ array['skill', 'mcp', 'prompt']::text[]),
  check (jsonb_typeof(issues) = 'array')
);

create index ds_ai_security_worker_heartbeats_seen_idx
  on public.ds_ai_security_worker_heartbeats (last_seen_at desc);

comment on table public.ds_ai_security_worker_heartbeats is
  'Liveness and per-adapter readiness for the isolated AI security worker.';

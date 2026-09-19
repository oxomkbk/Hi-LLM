create table public.wonder_work_moderation_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.app_users(id) on delete restrict,
  work_id uuid not null references public.wonder_works(id) on delete cascade,
  action text not null check (action in ('hide', 'restore')),
  reason text not null check (char_length(reason) between 2 and 1000),
  created_at timestamptz not null default now()
);

create index wonder_work_moderation_events_work_idx
  on public.wonder_work_moderation_events (work_id, created_at desc, id desc);

create index wonder_work_moderation_events_created_idx
  on public.wonder_work_moderation_events (created_at desc, id desc);

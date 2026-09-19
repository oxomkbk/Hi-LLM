create table public.wonder_editorial_cover_switches (
  id uuid primary key default gen_random_uuid(),
  seed_key text not null check (seed_key ~ '^[a-z0-9][a-z0-9:_-]{7,159}$'),
  switch_kind text not null check (switch_kind in ('cover_update', 'project_replacement')),
  old_work_id uuid not null references public.wonder_works(id) on delete restrict,
  new_work_id uuid not null references public.wonder_works(id) on delete restrict,
  old_registry_snapshot jsonb not null check (jsonb_typeof(old_registry_snapshot) = 'object'),
  new_registry_snapshot jsonb not null check (jsonb_typeof(new_registry_snapshot) = 'object'),
  old_cover_file_id uuid not null references public.file_objects(id) on delete restrict,
  new_cover_file_id uuid not null references public.file_objects(id) on delete restrict,
  old_cover_sha256 text not null check (old_cover_sha256 ~ '^[a-f0-9]{64}$'),
  new_cover_sha256 text not null check (new_cover_sha256 ~ '^[a-f0-9]{64}$'),
  normalization_version text not null check (normalization_version = 'official-preview-v1'),
  normalizer_sharp_version text not null check (normalizer_sharp_version = '0.35.3'),
  normalizer_vips_version text not null check (normalizer_vips_version = '8.18.3'),
  supersedes_receipt_id uuid references public.wonder_editorial_cover_switches(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (switch_kind = 'cover_update' and old_work_id = new_work_id)
    or (switch_kind = 'project_replacement' and old_work_id <> new_work_id)
  ),
  check (supersedes_receipt_id is null or supersedes_receipt_id <> id)
);

create index wonder_editorial_cover_switches_old_cover_idx
  on public.wonder_editorial_cover_switches (old_cover_file_id, old_work_id);

create index wonder_editorial_cover_switches_chain_idx
  on public.wonder_editorial_cover_switches (supersedes_receipt_id, created_at, id);

create or replace function app_private.validate_wonder_cover_switch_supersession()
returns trigger
language plpgsql
as $$
declare
  prior_event text;
  prior_seed_key text;
  prior_switch_kind text;
begin
  if new.supersedes_receipt_id is null then
    return new;
  end if;

  select receipt.seed_key, receipt.switch_kind
  into prior_seed_key, prior_switch_kind
  from public.wonder_editorial_cover_switches receipt
  where receipt.id = new.supersedes_receipt_id
  for update;

  select event into prior_event
  from public.wonder_editorial_cover_switch_events
  where receipt_id = new.supersedes_receipt_id
  order by id desc
  limit 1;

  if prior_seed_key is null
    or prior_seed_key <> new.seed_key
    or prior_switch_kind <> new.switch_kind
    or prior_event <> 'rolled_back'
    or exists (
      select 1 from public.wonder_editorial_cover_switches newer
      where newer.supersedes_receipt_id = new.supersedes_receipt_id
    )
  then
    raise exception 'invalid cover switch supersession' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger wonder_editorial_cover_switches_validate_supersession
before insert on public.wonder_editorial_cover_switches
for each row execute function app_private.validate_wonder_cover_switch_supersession();

create table public.wonder_editorial_cover_switch_events (
  id bigint generated always as identity primary key,
  receipt_id uuid not null references public.wonder_editorial_cover_switches(id) on delete restrict,
  event text not null check (event in ('switched', 'rolled_back', 'superseded', 'cleaned', 'retained')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (receipt_id, event)
);

create index wonder_editorial_cover_switch_events_receipt_idx
  on public.wonder_editorial_cover_switch_events (receipt_id, id);

create or replace function app_private.prevent_wonder_cover_switch_history_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wonder editorial cover switch history is append-only' using errcode = '23514';
end;
$$;

create trigger wonder_editorial_cover_switches_append_only
before update or delete on public.wonder_editorial_cover_switches
for each row execute function app_private.prevent_wonder_cover_switch_history_update();

create trigger wonder_editorial_cover_switch_events_append_only
before update or delete on public.wonder_editorial_cover_switch_events
for each row execute function app_private.prevent_wonder_cover_switch_history_update();

create or replace function app_private.validate_wonder_cover_switch_event()
returns trigger
language plpgsql
as $$
declare
  previous_event text;
begin
  perform 1
  from public.wonder_editorial_cover_switches
  where id = new.receipt_id
  for update;

  select event into previous_event
  from public.wonder_editorial_cover_switch_events
  where receipt_id = new.receipt_id
  order by id desc
  limit 1;

  if previous_event is null and new.event <> 'switched' then
    raise exception 'cover switch lifecycle must start with switched' using errcode = '23514';
  elsif previous_event = 'switched' and new.event not in ('rolled_back', 'cleaned', 'retained') then
    raise exception 'invalid cover switch transition: % -> %', previous_event, new.event using errcode = '23514';
  elsif previous_event = 'rolled_back' and new.event <> 'superseded' then
    raise exception 'invalid cover switch transition: % -> %', previous_event, new.event using errcode = '23514';
  elsif previous_event in ('cleaned', 'retained', 'superseded') then
    raise exception 'terminal cover switch lifecycle is immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger wonder_editorial_cover_switch_events_validate
before insert on public.wonder_editorial_cover_switch_events
for each row execute function app_private.validate_wonder_cover_switch_event();

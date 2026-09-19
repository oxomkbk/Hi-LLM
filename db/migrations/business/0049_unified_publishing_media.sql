alter table public.ds_prompt_assets
  drop constraint if exists ds_prompt_assets_file_id_key;

alter table public.ds_prompt_assets
  drop constraint if exists ds_prompt_assets_origin_check;

alter table public.ds_prompt_assets
  add constraint ds_prompt_assets_origin_check
  check (origin in ('package_source', 'package_extracted', 'direct_upload', 'library_reference'));

create unique index if not exists ds_prompt_assets_prompt_file_idx
  on public.ds_prompt_assets (prompt_id, file_id);

create index if not exists file_objects_ready_owner_created_idx
  on public.file_objects (owner_id, created_at desc, id desc)
  where status = 'ready';

alter table public.ds_prompts
  add column if not exists publish_requested_at timestamptz;

alter table public.ds_skills
  add column if not exists publish_requested_at timestamptz;

alter table public.ds_mcps
  add column if not exists publish_requested_at timestamptz;

create index if not exists ds_prompts_pending_publish_idx
  on public.ds_prompts (publish_requested_at, id)
  where publish_requested_at is not null and status = 'draft';

create index if not exists ds_skills_pending_publish_idx
  on public.ds_skills (publish_requested_at, id)
  where publish_requested_at is not null and status = 'draft';

create index if not exists ds_mcps_pending_publish_idx
  on public.ds_mcps (publish_requested_at, id)
  where publish_requested_at is not null and status = 'draft';

create table if not exists control.user_profile_background_files (
  id uuid primary key,
  upload_session_id uuid not null unique references control.upload_sessions(id) on delete restrict,
  owner_user_id text references auth."user"(id) on delete set null,
  storage_profile_id uuid not null references control.storage_profiles(id) on delete restrict,
  object_key text not null,
  original_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  extension text not null check (extension in ('png', 'jpg', 'jpeg', 'webp')),
  width_px integer check (width_px is null or width_px between 1 and 4096),
  height_px integer check (height_px is null or height_px between 1 and 4096),
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'failed', 'deleting', 'delete_failed', 'deleted'
  )),
  ready_at timestamptz,
  orphaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_profile_id, object_key)
);

create index if not exists user_profile_background_owner_status_idx
  on control.user_profile_background_files (owner_user_id, status, created_at desc);

create index if not exists user_profile_background_cleanup_idx
  on control.user_profile_background_files (
    status,
    (coalesce(orphaned_at, ready_at, created_at))
  );

create trigger user_profile_background_files_set_updated_at
before update on control.user_profile_background_files
for each row execute function control.set_updated_at();

create table if not exists control.user_profile_appearances (
  user_id text primary key references auth."user"(id) on delete cascade,
  background_file_id uuid unique references control.user_profile_background_files(id) on delete set null,
  preset text not null default 'daybreak' check (preset in (
    'daybreak', 'sea-glass', 'peach-haze', 'lime-air'
  )),
  opacity smallint not null default 55 check (opacity between 0 and 100),
  fit text not null default 'cover' check (fit in ('cover', 'contain', 'custom')),
  scale smallint not null default 100 check (scale between 50 and 200),
  height smallint not null default 300 check (height between 180 and 520),
  position_x smallint not null default 50 check (position_x between 0 and 100),
  position_y smallint not null default 50 check (position_y between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fit = 'custom' or scale = 100)
);

create index if not exists user_profile_appearance_background_idx
  on control.user_profile_appearances (background_file_id)
  where background_file_id is not null;

create trigger user_profile_appearances_set_updated_at
before update on control.user_profile_appearances
for each row execute function control.set_updated_at();

insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
) values (
  'user-profile-background',
  array['image/png', 'image/jpeg', 'image/webp'],
  array['png', 'jpg', 'jpeg', 'webp'],
  8388608, 5242880, 5242880, 2,
  1800, 4, 33554432, 268435456, 'private'
)
on conflict (scope) do update set
  allowed_mime_types = excluded.allowed_mime_types,
  allowed_extensions = excluded.allowed_extensions,
  max_size_bytes = excluded.max_size_bytes,
  multipart_threshold_bytes = excluded.multipart_threshold_bytes,
  part_size_bytes = excluded.part_size_bytes,
  max_concurrency = excluded.max_concurrency,
  session_ttl_seconds = excluded.session_ttl_seconds,
  max_active_sessions = excluded.max_active_sessions,
  daily_quota_bytes = excluded.daily_quota_bytes,
  total_quota_bytes = excluded.total_quota_bytes,
  visibility = excluded.visibility,
  updated_at = now();

revoke all on control.user_profile_background_files from public;
revoke all on control.user_profile_appearances from public;

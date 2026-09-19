create table if not exists control.user_avatar_files (
  id uuid primary key,
  upload_session_id uuid not null unique references control.upload_sessions(id) on delete restrict,
  owner_user_id text references auth."user"(id) on delete set null,
  storage_profile_id uuid not null references control.storage_profiles(id),
  object_key text not null,
  original_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 2097152),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  extension text not null check (extension in ('png', 'jpg', 'jpeg', 'webp')),
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'failed', 'deleting', 'delete_failed', 'deleted'
  )),
  ready_at timestamptz,
  orphaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_profile_id, object_key)
);

create index if not exists user_avatar_files_owner_status_idx
  on control.user_avatar_files (owner_user_id, status, created_at desc);

create trigger user_avatar_files_set_updated_at
before update on control.user_avatar_files
for each row execute function control.set_updated_at();

alter table auth."user"
  add column if not exists bio text,
  add column if not exists website text,
  add column if not exists "avatarFileId" uuid,
  add column if not exists "canAsk" boolean not null default true,
  add column if not exists "canAnswer" boolean not null default true,
  add column if not exists "canComment" boolean not null default true,
  add column if not exists "canUpload" boolean not null default true;

alter table auth."user"
  drop constraint if exists user_bio_length_check,
  add constraint user_bio_length_check check (bio is null or char_length(bio) <= 280),
  drop constraint if exists user_website_length_check,
  add constraint user_website_length_check check (website is null or char_length(website) <= 2048),
  drop constraint if exists user_avatar_file_fk,
  add constraint user_avatar_file_fk foreign key ("avatarFileId")
    references control.user_avatar_files(id) on delete set null,
  drop constraint if exists user_avatar_reference_check,
  add constraint user_avatar_reference_check check (
    ("avatarFileId" is null and (image is null or image !~ '^/api/avatars/'))
    or ("avatarFileId" is not null and image = '/api/avatars/' || "avatarFileId"::text)
  );

create index if not exists user_avatar_file_idx on auth."user" ("avatarFileId");

insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
) values (
  'user-avatar',
  array['image/png', 'image/jpeg', 'image/webp'],
  array['png', 'jpg', 'jpeg', 'webp'],
  2097152, 5242880, 5242880, 1,
  1800, 3, 10485760, 52428800, 'private'
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

revoke all on control.user_avatar_files from public;

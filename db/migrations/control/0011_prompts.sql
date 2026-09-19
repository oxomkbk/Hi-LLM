create table control.prompt_imports (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null,
  actor_id text not null references auth."user"(id) on delete cascade,
  database_profile_id uuid not null references control.database_profiles(id),
  storage_profile_id uuid not null references control.storage_profiles(id),
  status text not null default 'parsing' check (status in (
    'parsing', 'parsed', 'committing', 'committed', 'failed', 'expired'
  )),
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object'),
  error_code text,
  error_message text,
  staged_file_ids uuid[] not null default '{}',
  prompt_id uuid,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index prompt_imports_active_source_idx
  on control.prompt_imports (source_file_id)
  where status in ('parsing', 'parsed', 'committing');
create index prompt_imports_actor_created_idx
  on control.prompt_imports (actor_id, created_at desc);
create index prompt_imports_cleanup_idx
  on control.prompt_imports (status, expires_at, updated_at);

create trigger prompt_imports_set_updated_at
before update on control.prompt_imports
for each row execute function control.set_updated_at();

insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
) values
  (
    'prompt-package',
    array['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    array['zip'], 209715200, 16777216, 8388608, 3, 86400, 2,
    536870912, 2147483648, 'private'
  ),
  (
    'prompt-asset',
    array[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm',
      'application/octet-stream',
      'application/pdf', 'text/plain', 'text/markdown', 'application/json',
      'text/css', 'text/html', 'application/javascript', 'text/javascript'
    ],
    array[
      'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm',
      'pdf', 'txt', 'md', 'mdx', 'json', 'css', 'scss', 'less',
      'html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte'
    ],
    209715200, 16777216, 8388608, 3, 86400, 4,
    1073741824, 5368709120, 'private'
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
  visibility = excluded.visibility;

revoke all on control.prompt_imports from public;

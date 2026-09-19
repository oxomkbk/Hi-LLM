insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
) values (
  'wonderland-image',
  array['image/png', 'image/jpeg', 'image/webp'],
  array['png', 'jpg', 'jpeg', 'webp'],
  8388608, 8388608, 8388608, 2,
  3600, 6, 67108864, 536870912, 'private'
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

create table control.wonder_rate_buckets (
  database_profile_id uuid not null references control.database_profiles(id) on delete cascade,
  identity_hash text not null,
  action text not null check (action in (
    'question-create', 'answer-create', 'comment-create', 'report-create',
    'question-vote', 'answer-vote', 'question-view'
  )),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (database_profile_id, identity_hash, action, window_start)
);

create index wonder_rate_buckets_expiry_idx on control.wonder_rate_buckets (expires_at);

create trigger wonder_rate_buckets_set_updated_at
before update on control.wonder_rate_buckets
for each row execute function control.set_updated_at();

revoke all on control.wonder_rate_buckets from public;

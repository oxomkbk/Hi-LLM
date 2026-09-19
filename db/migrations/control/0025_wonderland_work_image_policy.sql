insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
)
select
  'wonderland-work-image', allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
from control.upload_policies
where scope = 'wonderland-image'
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

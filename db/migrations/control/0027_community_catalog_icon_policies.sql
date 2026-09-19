insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
)
select
  requested.scope, policy.allowed_mime_types, policy.allowed_extensions, policy.max_size_bytes,
  policy.multipart_threshold_bytes, policy.part_size_bytes, policy.max_concurrency,
  policy.session_ttl_seconds, policy.max_active_sessions, policy.daily_quota_bytes,
  policy.total_quota_bytes, 'private'
from control.upload_policies policy
cross join (values ('community-skill-icon'), ('community-mcp-icon')) requested(scope)
where policy.scope = 'catalog-icon'
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

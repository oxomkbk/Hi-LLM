create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists control;

revoke all on schema auth from public;
revoke all on schema control from public;

create table control.database_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text not null check (provider in ('local-postgres', 'tencent-postgres')),
  encrypted_config jsonb not null,
  schema_version text,
  status text not null default 'selectable' check (status in ('selectable', 'archived')),
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table control.storage_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text not null check (provider in ('local-filesystem', 'tencent-cos')),
  encrypted_config jsonb not null,
  status text not null default 'selectable' check (status in ('selectable', 'archived')),
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table control.runtime_settings (
  id boolean primary key default true check (id = true),
  active_database_profile_id uuid references control.database_profiles(id),
  default_storage_profile_id uuid references control.storage_profiles(id),
  config_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into control.runtime_settings (id) values (true) on conflict (id) do nothing;

create table control.upload_policies (
  id uuid primary key default gen_random_uuid(),
  scope text not null unique,
  allowed_mime_types text[] not null default '{}',
  allowed_extensions text[] not null default '{}',
  max_size_bytes bigint not null check (max_size_bytes > 0 and max_size_bytes <= 524288000),
  multipart_threshold_bytes bigint not null check (multipart_threshold_bytes > 0),
  part_size_bytes bigint not null check (part_size_bytes between 5242880 and 67108864),
  max_concurrency integer not null check (max_concurrency between 1 and 8),
  session_ttl_seconds integer not null check (session_ttl_seconds between 300 and 172800),
  max_active_sessions integer not null check (max_active_sessions between 1 and 20),
  daily_quota_bytes bigint not null check (daily_quota_bytes > 0),
  total_quota_bytes bigint not null check (total_quota_bytes > 0),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into control.upload_policies (
  scope, allowed_mime_types, allowed_extensions, max_size_bytes,
  multipart_threshold_bytes, part_size_bytes, max_concurrency,
  session_ttl_seconds, max_active_sessions, daily_quota_bytes,
  total_quota_bytes, visibility
) values
  (
    'website-logo', array['image/png', 'image/jpeg', 'image/webp'],
    array['png', 'jpg', 'jpeg', 'webp'], 1048576, 16777216, 8388608,
    1, 3600, 3, 10485760, 104857600, 'public'
  ),
  (
    'generic-file',
    array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'application/zip'],
    array['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt', 'zip'],
    524288000, 16777216, 8388608, 3, 86400, 3,
    2147483648, 10737418240, 'private'
  )
on conflict (scope) do nothing;

create table control.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  file_object_id uuid not null unique,
  user_id text not null,
  database_profile_id uuid not null references control.database_profiles(id),
  storage_profile_id uuid not null references control.storage_profiles(id),
  object_key text not null,
  provider_upload_id text,
  scope text not null,
  original_name text not null,
  declared_mime_type text not null,
  total_size_bytes bigint not null check (total_size_bytes > 0 and total_size_bytes <= 524288000),
  reserved_bytes bigint not null check (reserved_bytes > 0),
  part_size_bytes bigint not null,
  part_count integer not null check (part_count > 0 and part_count <= 10000),
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  status text not null default 'creating' check (status in (
    'creating', 'uploading', 'verifying', 'completed', 'cancelling', 'cancelled', 'expired', 'failed'
  )),
  checksum text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index upload_sessions_user_status_idx on control.upload_sessions (user_id, status);
create index upload_sessions_expiry_idx on control.upload_sessions (status, expires_at);

create table control.upload_quota_ledger (
  upload_session_id uuid primary key references control.upload_sessions(id),
  user_id text not null,
  reserved_bytes bigint not null check (reserved_bytes > 0),
  settled_bytes bigint,
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index upload_quota_ledger_user_created_idx
  on control.upload_quota_ledger (user_id, created_at);

create table control.background_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  resource_id text not null,
  action_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'leased', 'retry', 'dead', 'succeeded')),
  attempts integer not null default 0 check (attempts >= 0),
  next_run_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, resource_id, action_version)
);

create index background_jobs_claim_idx
  on control.background_jobs (status, next_run_at);

create table control.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  success boolean not null,
  code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_action_created_idx
  on control.audit_logs (action, created_at desc);

create or replace function control.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger database_profiles_set_updated_at
before update on control.database_profiles
for each row execute function control.set_updated_at();

create trigger storage_profiles_set_updated_at
before update on control.storage_profiles
for each row execute function control.set_updated_at();

create trigger upload_policies_set_updated_at
before update on control.upload_policies
for each row execute function control.set_updated_at();

create trigger upload_sessions_set_updated_at
before update on control.upload_sessions
for each row execute function control.set_updated_at();

create trigger background_jobs_set_updated_at
before update on control.background_jobs
for each row execute function control.set_updated_at();

revoke all on all tables in schema control from public;
revoke all on all sequences in schema control from public;
revoke all on all functions in schema control from public;

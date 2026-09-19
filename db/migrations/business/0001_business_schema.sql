create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create schema if not exists app_private;
revoke all on schema app_private from public;

create table public.app_users (
  id uuid primary key,
  email text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ds_categorys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete restrict,
  emial text not null,
  name text not null,
  sort integer not null default 1 check (sort between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table public.file_objects (
  id uuid primary key,
  upload_session_id uuid unique,
  owner_id uuid references public.app_users(id) on delete set null,
  storage_profile_id uuid not null,
  object_key text not null,
  original_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 524288000),
  mime_type text not null,
  extension text not null,
  crc64 text,
  sha256 text,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  status text not null default 'pending' check (status in (
    'pending', 'quarantined', 'ready', 'failed', 'deleting', 'delete_failed', 'deleted'
  )),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz,
  unique (storage_profile_id, object_key)
);

create index file_objects_owner_created_idx on public.file_objects (owner_id, created_at desc);
create index file_objects_storage_status_idx on public.file_objects (storage_profile_id, status);

create table public.ds_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete restrict,
  emial text not null,
  category_id uuid not null references public.ds_categorys(id) on delete restrict,
  name text not null,
  url text not null,
  logo text,
  logo_file_id uuid references public.file_objects(id) on delete set null,
  tags text[] not null default '{}',
  "desc" text,
  pinned boolean not null default false,
  recommend boolean not null default false,
  vpn boolean not null default false,
  "visitCount" integer not null default 0 check ("visitCount" >= 0),
  "commonlyUsed" boolean not null default false,
  sort integer not null default 1 check (sort between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name),
  unique (url)
);

create index ds_categorys_public_order_idx on public.ds_categorys (sort desc, created_at desc);
create index ds_websites_category_order_idx on public.ds_websites
  (category_id, pinned desc, sort desc, recommend desc, created_at desc);
create index ds_websites_ranking_idx on public.ds_websites ("visitCount" desc, created_at, id);

create table public.ds_website_submissions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ds_categorys(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  url text not null,
  logo text not null,
  tags text[] not null default '{}',
  "desc" text,
  pinned boolean not null default false,
  recommend boolean not null default false,
  vpn boolean not null default false,
  "commonlyUsed" boolean not null default false,
  sort integer not null default 1 check (sort between 1 and 99),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  submitted_ip_hash text not null,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ds_website_submissions_pending_url_idx
  on public.ds_website_submissions (url) where status = 'pending';
create index ds_website_submissions_status_created_idx
  on public.ds_website_submissions (status, created_at desc);
create index ds_website_submissions_ip_created_idx
  on public.ds_website_submissions (submitted_ip_hash, created_at desc);

create table public.ds_website_visit_events (
  id bigint generated always as identity primary key,
  website_id uuid not null references public.ds_websites(id) on delete cascade,
  visitor_hash text not null,
  bucket_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (website_id, visitor_hash, bucket_start)
);

create index ds_website_visit_events_created_idx
  on public.ds_website_visit_events (created_at desc);

create table public.ds_skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  source_url text not null unique,
  homepage_url text,
  install_command text,
  author_name text not null,
  author_url text,
  version text,
  license text,
  icon text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  verified boolean not null default false,
  sort smallint not null default 1 check (sort between 1 and 99),
  published_by uuid references public.app_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  check (status <> 'published' or published_at is not null)
);

create table public.ds_skill_submissions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  summary text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  source_url text not null,
  homepage_url text,
  install_command text,
  author_name text not null,
  author_url text,
  version text,
  license text,
  icon text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitter_name text not null,
  submitter_email text,
  submitted_ip_hash text not null,
  review_note text,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ds_skills_public_listing_idx on public.ds_skills
  (status, featured desc, verified desc, sort desc, published_at desc, id);
create index ds_skills_category_idx on public.ds_skills
  (category, status, featured desc, verified desc, sort desc, published_at desc, id);
create index ds_skills_tags_idx on public.ds_skills using gin (tags);
create index ds_skills_platforms_idx on public.ds_skills using gin (platforms);
create index ds_skills_name_search_idx on public.ds_skills using gin (name gin_trgm_ops);
create unique index ds_skill_submissions_pending_source_url_idx
  on public.ds_skill_submissions (source_url) where status = 'pending';
create unique index ds_skill_submissions_pending_slug_idx
  on public.ds_skill_submissions (slug) where status = 'pending';
create index ds_skill_submissions_status_created_idx
  on public.ds_skill_submissions (status, created_at desc);
create index ds_skill_submissions_ip_created_idx
  on public.ds_skill_submissions (submitted_ip_hash, created_at desc);

create table public.ds_mcps (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  registry_name text,
  name text not null,
  summary text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  capabilities text[] not null default '{}',
  clients text[] not null default '{}',
  language text,
  protocol_version text not null,
  installations jsonb not null default '[]'::jsonb,
  installation_transports text[] not null default '{}',
  source_url text not null,
  homepage_url text,
  docs_url text,
  publisher_name text not null,
  publisher_url text,
  version text,
  license text,
  icon text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  verified boolean not null default false,
  sort smallint not null default 1 check (sort between 1 and 99),
  published_by uuid references public.app_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (jsonb_typeof(installations) = 'array' and jsonb_array_length(installations) between 1 and 8),
  check (status <> 'published' or published_at is not null)
);

create unique index ds_mcps_slug_unique on public.ds_mcps (lower(slug));
create unique index ds_mcps_source_unique on public.ds_mcps (lower(source_url));
create unique index ds_mcps_registry_name_unique on public.ds_mcps (lower(registry_name)) where registry_name is not null;
create index ds_mcps_public_order_idx on public.ds_mcps
  (status, featured desc, verified desc, sort desc, published_at desc, id);
create index ds_mcps_category_idx on public.ds_mcps (category) where status = 'published';
create index ds_mcps_clients_gin_idx on public.ds_mcps using gin (clients);
create index ds_mcps_transports_gin_idx on public.ds_mcps using gin (installation_transports);

create table public.ds_mcp_submissions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  registry_name text,
  name text not null,
  summary text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  capabilities text[] not null default '{}',
  clients text[] not null default '{}',
  language text,
  protocol_version text not null,
  installations jsonb not null default '[]'::jsonb,
  installation_transports text[] not null default '{}',
  source_url text not null,
  homepage_url text,
  docs_url text,
  publisher_name text not null,
  publisher_url text,
  version text,
  license text,
  icon text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitter_name text not null,
  submitter_email text,
  submitted_ip_hash text not null,
  submitted_contact_hash text not null,
  review_note text,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  approved_mcp_id uuid unique references public.ds_mcps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(installations) = 'array' and jsonb_array_length(installations) between 1 and 8)
);

create unique index ds_mcp_submissions_pending_slug_unique
  on public.ds_mcp_submissions (lower(slug)) where status = 'pending';
create unique index ds_mcp_submissions_pending_source_unique
  on public.ds_mcp_submissions (lower(source_url)) where status = 'pending';
create index ds_mcp_submissions_queue_idx
  on public.ds_mcp_submissions (status, created_at desc, id);

create table app_private.mcp_submission_rate_events (
  id bigint generated always as identity primary key,
  bucket_type text not null check (bucket_type in ('global', 'ip', 'contact')),
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index mcp_rate_bucket_idx on app_private.mcp_submission_rate_events
  (bucket_type, bucket_key, created_at desc);
create index mcp_rate_expiry_idx on app_private.mcp_submission_rate_events (created_at);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.mcp_installation_transports(payload jsonb)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(array_agg(distinct value->>'transport' order by value->>'transport'), '{}')
  from jsonb_array_elements(payload) as item(value)
  where value->>'transport' in ('stdio', 'streamable-http');
$$;

create or replace function app_private.sync_mcp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.installation_transports := app_private.mcp_installation_transports(new.installations);
  return new;
end;
$$;

create trigger app_users_set_updated_at before update on public.app_users
for each row execute function app_private.set_updated_at();
create trigger ds_categorys_set_updated_at before update on public.ds_categorys
for each row execute function app_private.set_updated_at();
create trigger ds_websites_set_updated_at before update on public.ds_websites
for each row execute function app_private.set_updated_at();
create trigger ds_website_submissions_set_updated_at before update on public.ds_website_submissions
for each row execute function app_private.set_updated_at();
create trigger ds_skills_set_updated_at before update on public.ds_skills
for each row execute function app_private.set_updated_at();
create trigger ds_skill_submissions_set_updated_at before update on public.ds_skill_submissions
for each row execute function app_private.set_updated_at();
create trigger ds_mcps_sync_row before insert or update on public.ds_mcps
for each row execute function app_private.sync_mcp_row();
create trigger ds_mcp_submissions_sync_row before insert or update on public.ds_mcp_submissions
for each row execute function app_private.sync_mcp_row();

revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema app_private from public;
revoke all on all tables in schema app_private from public;
revoke all on all sequences in schema app_private from public;

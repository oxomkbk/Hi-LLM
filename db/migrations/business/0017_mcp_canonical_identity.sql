drop index if exists public.ds_mcps_slug_unique;
drop index if exists public.ds_mcps_source_unique;
drop index if exists public.ds_mcps_registry_name_unique;
drop index if exists public.ds_mcp_submissions_pending_slug_unique;
drop index if exists public.ds_mcp_submissions_pending_source_unique;
drop index if exists public.ds_mcp_submissions_pending_registry_unique;

create unique index ds_mcps_slug_unique
  on public.ds_mcps (lower(btrim(slug)));

create unique index ds_mcps_source_unique
  on public.ds_mcps (lower(btrim(source_url)))
  where source_url is not null;

create unique index ds_mcps_registry_name_unique
  on public.ds_mcps (lower(btrim(registry_name)))
  where registry_name is not null;

create unique index ds_mcp_submissions_pending_slug_unique
  on public.ds_mcp_submissions (lower(btrim(slug)))
  where status in ('pending', 'pending_security');

create unique index ds_mcp_submissions_pending_source_unique
  on public.ds_mcp_submissions (lower(btrim(source_url)))
  where status in ('pending', 'pending_security') and source_url is not null;

create unique index ds_mcp_submissions_pending_registry_unique
  on public.ds_mcp_submissions (lower(btrim(registry_name)))
  where status in ('pending', 'pending_security') and registry_name is not null;

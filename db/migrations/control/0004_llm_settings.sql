create table control.llm_settings (
  id boolean primary key default true check (id = true),
  protocol text not null check (protocol in ('openai', 'anthropic')),
  base_url text not null,
  model text not null,
  encrypted_api_key jsonb not null,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger llm_settings_set_updated_at
before update on control.llm_settings
for each row execute function control.set_updated_at();

create table control.website_extraction_events (
  id bigint generated always as identity primary key,
  bucket_type text not null check (bucket_type in ('global', 'visitor')),
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index website_extraction_events_bucket_idx
  on control.website_extraction_events (bucket_type, bucket_key, created_at desc);
create index website_extraction_events_created_idx
  on control.website_extraction_events (created_at);

update control.upload_policies
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'],
    allowed_extensions = array['png', 'jpg', 'jpeg', 'webp', 'ico']
where scope = 'website-logo';

revoke all on control.llm_settings from public;
revoke all on control.website_extraction_events from public;
revoke all on all sequences in schema control from public;

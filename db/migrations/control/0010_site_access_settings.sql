create table if not exists control.site_access_settings (
  id boolean primary key default true check (id = true),
  registration_enabled boolean not null default true,
  website_submission_mode text not null default 'anonymous'
    check (website_submission_mode in ('anonymous', 'authenticated')),
  skill_submission_mode text not null default 'anonymous'
    check (skill_submission_mode in ('anonymous', 'authenticated')),
  mcp_submission_mode text not null default 'anonymous'
    check (mcp_submission_mode in ('anonymous', 'authenticated')),
  wonderland_composer_mode text not null default 'authenticated'
    check (wonderland_composer_mode in ('authenticated', 'guest_preview')),
  config_version bigint not null default 1 check (config_version > 0),
  updated_by text references auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into control.site_access_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists site_access_settings_set_updated_at on control.site_access_settings;
create trigger site_access_settings_set_updated_at
before update on control.site_access_settings
for each row execute function control.set_updated_at();

revoke all on control.site_access_settings from public;

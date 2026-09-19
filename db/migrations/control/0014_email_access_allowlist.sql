alter table control.site_access_settings
  add column if not exists email_access_mode text not null default 'open',
  add column if not exists email_allowlist text[] not null default '{}';

alter table control.site_access_settings
  drop constraint if exists site_access_settings_email_mode_check,
  add constraint site_access_settings_email_mode_check
    check (email_access_mode in ('open', 'allowlist')),
  drop constraint if exists site_access_settings_email_allowlist_size_check,
  add constraint site_access_settings_email_allowlist_size_check
    check (coalesce(cardinality(email_allowlist), 0) <= 200);

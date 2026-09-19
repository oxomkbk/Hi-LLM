alter table control.site_access_settings
  add column if not exists content_detail_open_mode text not null default 'same_tab'
    check (content_detail_open_mode in ('same_tab', 'new_tab'));

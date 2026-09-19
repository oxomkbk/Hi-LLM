create index if not exists ds_website_visit_events_window_idx
  on public.ds_website_visit_events (created_at desc, website_id);

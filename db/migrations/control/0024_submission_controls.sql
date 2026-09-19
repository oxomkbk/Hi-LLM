alter table control.site_access_settings
  add column if not exists website_submission_enabled boolean not null default true,
  add column if not exists website_submission_visible boolean not null default true,
  add column if not exists skill_submission_enabled boolean not null default true,
  add column if not exists skill_submission_visible boolean not null default true,
  add column if not exists mcp_submission_enabled boolean not null default true,
  add column if not exists mcp_submission_visible boolean not null default true,
  add column if not exists prompt_submission_enabled boolean not null default true,
  add column if not exists prompt_submission_visible boolean not null default true,
  add column if not exists wonderland_submission_enabled boolean not null default true,
  add column if not exists wonderland_submission_visible boolean not null default true,
  add column if not exists work_submission_enabled boolean not null default true,
  add column if not exists work_submission_visible boolean not null default true;

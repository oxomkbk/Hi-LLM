-- A repository can publish more than one Skill. Repository URL alone is not
-- a valid identity; the selected Skill in the install command completes it.
drop index if exists public.ds_skills_source_url_unique;
drop index if exists public.ds_skill_submissions_pending_source_url_idx;

create unique index ds_skills_external_source_unique
  on public.ds_skills (lower(source_url))
  where source_kind = 'external_page' and source_url is not null;

create unique index ds_skills_git_source_install_unique
  on public.ds_skills (lower(source_url), lower(coalesce(install_command, '')))
  where source_kind = 'git_repository' and source_url is not null;

create unique index ds_skill_submissions_pending_external_source_idx
  on public.ds_skill_submissions (lower(source_url))
  where status in ('pending', 'pending_security')
    and source_kind = 'external_page'
    and source_url is not null;

create unique index ds_skill_submissions_pending_git_source_install_idx
  on public.ds_skill_submissions (lower(source_url), lower(coalesce(install_command, '')))
  where status in ('pending', 'pending_security')
    and source_kind = 'git_repository'
    and source_url is not null;

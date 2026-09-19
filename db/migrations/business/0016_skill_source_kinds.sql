alter table public.ds_skills
  add column source_kind text;

alter table public.ds_skill_submissions
  add column source_kind text;

-- Conservative backfill: only repository roots and supported tree URLs are
-- classified as Git repositories. Profile, issue and blob pages remain pages.
update public.ds_skills
set source_kind = case
  when source_url ~* '^https://github\.com/[^/?#]+/[^/?#]+(\.git)?(/tree/[^/?#]+(/[^?#]+)*)?/?$'
    or (
      source_url ~* '^https://gitlab\.com/([^/?#]+/)+[^/?#]+(\.git)?(/-/tree/[^/?#]+(/[^?#]+)*)?/?$'
      and source_url !~* '/-/(blob|commit|issues|merge_requests)/'
    )
    then 'git_repository'
  else 'external_page'
end
where source_kind is null;

update public.ds_skill_submissions
set source_kind = case
  when source_url ~* '^https://github\.com/[^/?#]+/[^/?#]+(\.git)?(/tree/[^/?#]+(/[^?#]+)*)?/?$'
    or (
      source_url ~* '^https://gitlab\.com/([^/?#]+/)+[^/?#]+(\.git)?(/-/tree/[^/?#]+(/[^?#]+)*)?/?$'
      and source_url !~* '/-/(blob|commit|issues|merge_requests)/'
    )
    then 'git_repository'
  else 'external_page'
end
where source_kind is null;

alter table public.ds_skills
  alter column source_url drop not null,
  alter column source_kind set not null,
  add constraint ds_skills_source_kind_check
    check (source_kind in ('git_repository', 'external_page', 'platform_content')),
  add constraint ds_skills_source_shape_check
    check (
      (source_kind = 'platform_content' and source_url is null)
      or (source_kind in ('git_repository', 'external_page') and source_url is not null)
    );

alter table public.ds_skill_submissions
  alter column source_url drop not null,
  alter column source_kind set not null,
  add constraint ds_skill_submissions_source_kind_check
    check (source_kind in ('git_repository', 'external_page', 'platform_content')),
  add constraint ds_skill_submissions_source_shape_check
    check (
      (source_kind = 'platform_content' and source_url is null)
      or (source_kind in ('git_repository', 'external_page') and source_url is not null)
    );

alter table public.ds_skills
  drop constraint ds_skills_source_url_key;

drop index public.ds_skill_submissions_pending_source_url_idx;

create unique index ds_skills_source_url_unique
  on public.ds_skills (lower(source_url))
  where source_url is not null;

create unique index ds_skill_submissions_pending_source_url_idx
  on public.ds_skill_submissions (lower(source_url))
  where status in ('pending', 'pending_security') and source_url is not null;

-- The declared Skill fingerprint now contains source_kind. Do not expose an
-- old report as current until the subject is assessed with the new snapshot.
update public.ds_ai_security_subject_states
set report_state = 'stale',
    score = null,
    grade = null,
    verdict = null,
    public_visible = false,
    fresh_until = null,
    stale_at = now(),
    updated_at = now(),
    row_version = row_version + 1
where subject_type in ('skill', 'skill_submission')
  and report_state in ('passed', 'review_required', 'blocked');

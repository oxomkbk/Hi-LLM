create or replace function app_private.require_ready_file_reference()
returns trigger
language plpgsql
as $$
declare
  referenced_file_id uuid;
begin
  referenced_file_id := case tg_table_name
    when 'ds_websites' then new.logo_file_id
    when 'ds_ai_security_assessments' then new.raw_report_file_id
    when 'wonder_news_articles' then new.cover_file_id
    when 'wonder_works' then new.cover_file_id
    when 'wonder_editorial_seed_items' then new.cover_file_id
    else new.file_id
  end;

  if referenced_file_id is null then
    return new;
  end if;

  perform 1
  from public.file_objects
  where id = referenced_file_id and status = 'ready'
  for key share;

  if not found then
    raise exception 'wonderland file reference requires a ready file' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger wonder_works_require_ready_cover
before insert or update of cover_file_id on public.wonder_works
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_work_files_require_ready_file
before insert or update of file_id on public.wonder_work_files
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_editorial_seed_items_require_ready_cover
before insert or update of cover_file_id on public.wonder_editorial_seed_items
for each row execute function app_private.require_ready_file_reference();

create trigger ds_websites_require_ready_logo
before insert or update of logo_file_id on public.ds_websites
for each row execute function app_private.require_ready_file_reference();

create trigger ds_prompt_assets_require_ready_file
before insert or update of file_id on public.ds_prompt_assets
for each row execute function app_private.require_ready_file_reference();

create trigger ds_ai_security_assessments_require_ready_report
before insert or update of raw_report_file_id on public.ds_ai_security_assessments
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_question_files_require_ready_file
before insert or update of file_id on public.wonder_question_files
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_answer_files_require_ready_file
before insert or update of file_id on public.wonder_answer_files
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_news_articles_require_ready_cover
before insert or update of cover_file_id on public.wonder_news_articles
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_news_files_require_ready_file
before insert or update of file_id on public.wonder_news_files
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_comment_files_require_ready_file
before insert or update of file_id on public.wonder_comment_files
for each row execute function app_private.require_ready_file_reference();

create trigger wonder_moderation_events_require_ready_file
before insert or update of file_id on public.wonder_moderation_events
for each row execute function app_private.require_ready_file_reference();

create or replace function app_private.require_ready_file_token()
returns trigger
language plpgsql
as $$
declare
  file_token text;
  referenced_file_id uuid;
begin
  file_token := case tg_table_name
    when 'ds_website_submissions' then new.logo
    else new.icon
  end;

  if file_token like 'file:%' then
    referenced_file_id := substring(file_token from 6)::uuid;
  elsif file_token like '/api/files/%' then
    referenced_file_id := substring(file_token from 12)::uuid;
  else
    return new;
  end if;

  perform 1
  from public.file_objects
  where id = referenced_file_id and status = 'ready'
  for key share;

  if not found then
    raise exception 'file token requires a ready file' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ds_website_submissions_require_ready_logo_token
before insert or update of logo on public.ds_website_submissions
for each row execute function app_private.require_ready_file_token();

create trigger ds_skills_require_ready_icon_token
before insert or update of icon on public.ds_skills
for each row execute function app_private.require_ready_file_token();

create trigger ds_skill_submissions_require_ready_icon_token
before insert or update of icon on public.ds_skill_submissions
for each row execute function app_private.require_ready_file_token();

create trigger ds_mcps_require_ready_icon_token
before insert or update of icon on public.ds_mcps
for each row execute function app_private.require_ready_file_token();

create trigger ds_mcp_submissions_require_ready_icon_token
before insert or update of icon on public.ds_mcp_submissions
for each row execute function app_private.require_ready_file_token();

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
  for share;

  if not found then
    raise exception 'file reference requires a ready file' using errcode = '23514';
  end if;
  return new;
end;
$$;

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
  for share;

  if not found then
    raise exception 'file token requires a ready file' using errcode = '23514';
  end if;
  return new;
end;
$$;

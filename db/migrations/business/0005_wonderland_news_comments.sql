alter table public.wonder_news_articles
  add column comment_count integer not null default 0 check (comment_count >= 0);

alter table public.wonder_comments
  alter column question_id drop not null,
  add column news_id uuid references public.wonder_news_articles(id) on delete cascade;

alter table public.wonder_comments
  drop constraint wonder_comments_parent_id_fkey,
  add constraint wonder_comments_parent_id_fkey
    foreign key (parent_id) references public.wonder_comments(id) on delete cascade,
  add constraint wonder_comments_target_check check (
    (news_id is not null and question_id is null and answer_id is null)
    or (news_id is null and question_id is not null)
  );

drop trigger wonder_comments_validate_parent on public.wonder_comments;

create or replace function app_private.validate_wonder_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_row public.wonder_comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'wonder comment cannot reference itself' using errcode = '23514';
  end if;

  select * into parent_row from public.wonder_comments where id = new.parent_id;
  if not found
    or parent_row.question_id is distinct from new.question_id
    or parent_row.answer_id is distinct from new.answer_id
    or parent_row.news_id is distinct from new.news_id
    or parent_row.parent_id is not null then
    raise exception 'wonder comment parent must be a root comment in the same discussion' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger wonder_comments_validate_parent
after insert or update of parent_id, question_id, answer_id, news_id on public.wonder_comments
deferrable initially immediate
for each row execute function app_private.validate_wonder_comment_parent();

revoke all on function app_private.validate_wonder_comment_parent() from public;

create index wonder_comments_news_idx
  on public.wonder_comments (news_id, visibility, created_at, id)
  where news_id is not null;

create table public.wonder_comment_files (
  comment_id uuid not null references public.wonder_comments(id) on delete cascade,
  file_id uuid not null references public.file_objects(id) on delete restrict,
  position smallint not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (comment_id, file_id),
  unique (comment_id, position)
);

create index wonder_comment_files_file_idx
  on public.wonder_comment_files (file_id, comment_id);

alter table public.wonder_notifications
  add column news_id uuid references public.wonder_news_articles(id) on delete cascade;

create index wonder_notifications_news_idx
  on public.wonder_notifications (news_id, created_at desc, id desc)
  where news_id is not null;

update public.wonder_news_articles article
set comment_count = (
  select count(*)
  from public.wonder_comments comment
  where comment.news_id = article.id and comment.visibility = 'visible'
);

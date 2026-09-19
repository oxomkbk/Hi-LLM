create table public.ds_website_categories (
  website_id uuid not null references public.ds_websites(id) on delete cascade,
  category_id uuid not null references public.ds_categorys(id) on delete restrict,
  position smallint not null check (position between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (website_id, category_id),
  unique (website_id, position)
);

create index ds_website_categories_category_idx
  on public.ds_website_categories (category_id, website_id);

insert into public.ds_website_categories (website_id, category_id, position)
select id, category_id, 0
from public.ds_websites
on conflict do nothing;

create table public.ds_website_submission_categories (
  submission_id uuid not null references public.ds_website_submissions(id) on delete cascade,
  category_id uuid not null references public.ds_categorys(id) on delete restrict,
  position smallint not null check (position between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (submission_id, category_id),
  unique (submission_id, position)
);

create index ds_website_submission_categories_category_idx
  on public.ds_website_submission_categories (category_id, submission_id);

insert into public.ds_website_submission_categories (submission_id, category_id, position)
select id, category_id, 0
from public.ds_website_submissions
on conflict do nothing;

-- 兼容短暂运行的旧应用实例：旧代码只写 category_id 时，至少同步主分类关联。
create or replace function app_private.sync_website_primary_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ds_website_categories (website_id, category_id, position)
    values (new.id, new.category_id, 0)
    on conflict do nothing;
  elsif new.category_id is distinct from old.category_id then
    delete from public.ds_website_categories
    where website_id = new.id and position = 0;

    update public.ds_website_categories
    set position = 0
    where website_id = new.id and category_id = new.category_id;

    if not found then
      insert into public.ds_website_categories (website_id, category_id, position)
      values (new.id, new.category_id, 0);
    end if;
  end if;
  return new;
end;
$$;

create trigger ds_websites_sync_primary_category
after insert or update of category_id on public.ds_websites
for each row execute function app_private.sync_website_primary_category();

create or replace function app_private.sync_website_submission_primary_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ds_website_submission_categories (submission_id, category_id, position)
    values (new.id, new.category_id, 0)
    on conflict do nothing;
  elsif new.category_id is distinct from old.category_id then
    delete from public.ds_website_submission_categories
    where submission_id = new.id and position = 0;

    update public.ds_website_submission_categories
    set position = 0
    where submission_id = new.id and category_id = new.category_id;

    if not found then
      insert into public.ds_website_submission_categories (submission_id, category_id, position)
      values (new.id, new.category_id, 0);
    end if;
  end if;
  return new;
end;
$$;

create trigger ds_website_submissions_sync_primary_category
after insert or update of category_id on public.ds_website_submissions
for each row execute function app_private.sync_website_submission_primary_category();

revoke all on public.ds_website_categories from public;
revoke all on public.ds_website_submission_categories from public;
revoke all on function app_private.sync_website_primary_category() from public;
revoke all on function app_private.sync_website_submission_primary_category() from public;

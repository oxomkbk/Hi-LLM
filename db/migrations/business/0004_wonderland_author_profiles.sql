alter table public.app_users
  add column if not exists display_name text,
  add column if not exists avatar_url text;

alter table public.app_users
  add constraint app_users_display_name_length_check
    check (display_name is null or char_length(display_name) between 1 and 80),
  add constraint app_users_avatar_url_length_check
    check (avatar_url is null or char_length(avatar_url) <= 2048);

insert into public.wonder_categories (
  scope, depth, slug, name, description, icon, sort, is_active
) values
  ('question', 0, 'technology', '技术与工程', '开发、架构、AI 与基础设施实践', 'code', 90, true),
  ('question', 0, 'product', '产品与设计', '产品策略、交互设计与增长方法', 'layers', 80, true),
  ('question', 0, 'tools', '工具与效率', '软件工具、自动化与效率工作流', 'wrench', 70, true),
  ('question', 0, 'open-talk', '开放交流', '职业、学习与社区话题', 'message', 60, true),
  ('news', 0, 'community-news', '社区新闻', '妙妙屋公告、精选内容与行业观察', 'newspaper', 90, true)
on conflict do nothing;

create or replace function app_private.validate_wonder_category_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.wonder_categories child
    where child.parent_id = new.id
      and (new.scope <> 'question' or new.depth <> 0)
  ) then
    raise exception 'wonder category with children must remain a root question category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger wonder_categories_validate_children
after update of scope, depth on public.wonder_categories
deferrable initially immediate
for each row execute function app_private.validate_wonder_category_children();

revoke all on function app_private.validate_wonder_category_children() from public;

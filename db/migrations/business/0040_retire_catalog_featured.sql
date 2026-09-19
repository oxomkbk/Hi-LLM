-- Reset the current catalog curation so editors can build a useful featured set manually.
-- Future imports keep the default false; the featured columns remain fully editable.

update public.ds_skills set featured = false where featured;
update public.ds_mcps set featured = false where featured;
update public.ds_prompts set featured = false where featured;

update public.ds_skills
set tags = array(
  select replace(tag.value, '精选', '收录')
  from unnest(ds_skills.tags) with ordinality as tag(value, position)
  order by tag.position
)
where exists (select 1 from unnest(ds_skills.tags) as item(value) where item.value like '%精选%');

update public.ds_mcps
set tags = array(
  select replace(tag.value, '精选', '收录')
  from unnest(ds_mcps.tags) with ordinality as tag(value, position)
  order by tag.position
)
where exists (select 1 from unnest(ds_mcps.tags) as item(value) where item.value like '%精选%');

update public.ds_prompts
set tags = array(
  select replace(tag.value, '精选', '收录')
  from unnest(ds_prompts.tags) with ordinality as tag(value, position)
  order by tag.position
)
where exists (select 1 from unnest(ds_prompts.tags) as item(value) where item.value like '%精选%');

alter table public.ds_skills alter column featured set default false;
alter table public.ds_mcps alter column featured set default false;
alter table public.ds_prompts alter column featured set default false;

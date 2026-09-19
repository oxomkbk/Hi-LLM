-- Correct installations that applied migration 0040 before manual curation was clarified.
-- Existing rows stay unfeatured; editors can opt individual records back into curation.

alter table public.ds_skills
  drop constraint if exists ds_skills_featured_retired_check;
alter table public.ds_mcps
  drop constraint if exists ds_mcps_featured_retired_check;
alter table public.ds_prompts
  drop constraint if exists ds_prompts_featured_retired_check;

drop index if exists public.ds_skills_public_listing_idx;
create index ds_skills_public_listing_idx on public.ds_skills
  (status, featured desc, verified desc, sort desc, published_at desc, id);

drop index if exists public.ds_skills_category_idx;
create index ds_skills_category_idx on public.ds_skills
  (category, status, featured desc, verified desc, sort desc, published_at desc, id);

drop index if exists public.ds_mcps_public_order_idx;
create index ds_mcps_public_order_idx on public.ds_mcps
  (status, featured desc, verified desc, sort desc, published_at desc, id);

drop index if exists public.ds_prompts_public_order_idx;
create index ds_prompts_public_order_idx on public.ds_prompts
  (status, featured desc, sort desc, published_at desc, id);

drop index if exists public.ds_prompts_kind_idx;
create index ds_prompts_kind_idx on public.ds_prompts
  (content_kind, status, featured desc, sort desc, published_at desc, id);

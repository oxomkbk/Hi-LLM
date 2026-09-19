create table public.ds_prompt_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.ds_prompt_categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 240),
  kind text check (kind is null or kind in ('web_ui', 'image', 'video', 'adaptation', 'general')),
  sort smallint not null default 1 check (sort between 1 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((parent_id is null and kind is not null) or (parent_id is not null and kind is null))
);

create table public.ds_prompts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 500),
  content_kind text not null check (content_kind in ('web_ui', 'image', 'video', 'adaptation')),
  tags text[] not null default '{}',
  compatibility text[] not null default '{}',
  featured boolean not null default false,
  sort smallint not null default 1 check (sort between 1 and 99),
  preview_status text not null default 'none' check (preview_status in ('none', 'ready', 'invalid')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source_import_id uuid unique,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  published_by uuid references public.app_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create table public.ds_prompt_category_links (
  prompt_id uuid not null references public.ds_prompts(id) on delete cascade,
  category_id uuid not null references public.ds_prompt_categories(id) on delete restrict,
  is_primary boolean not null default false,
  position smallint not null default 0 check (position between 0 and 15),
  created_at timestamptz not null default now(),
  primary key (prompt_id, category_id),
  unique (prompt_id, position)
);

create unique index ds_prompt_category_links_primary_idx
  on public.ds_prompt_category_links (prompt_id) where is_primary;

create table public.ds_prompt_documents (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.ds_prompts(id) on delete cascade,
  source_path text not null,
  name text not null check (char_length(name) between 1 and 180),
  role text not null check (role in (
    'prompt', 'negative_prompt', 'readme', 'design', 'style',
    'tokens', 'parameters', 'example', 'other'
  )),
  language text not null default 'text' check (char_length(language) between 1 and 40),
  content text not null check (octet_length(content) <= 2097152),
  sort smallint not null default 0 check (sort between 0 and 999),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, source_path),
  check (not is_primary or role = 'prompt')
);

create unique index ds_prompt_documents_primary_idx
  on public.ds_prompt_documents (prompt_id) where is_primary;

create table public.ds_prompt_assets (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.ds_prompts(id) on delete cascade,
  file_id uuid not null unique references public.file_objects(id) on delete restrict,
  import_id uuid,
  source_path text not null,
  name text not null check (char_length(name) between 1 and 180),
  role text not null check (role in (
    'cover', 'image', 'video', 'poster', 'web_preview', 'attachment', 'source_package'
  )),
  origin text not null check (origin in ('package_source', 'package_extracted', 'direct_upload')),
  sort smallint not null default 0 check (sort between 0 and 999),
  is_primary boolean not null default false,
  is_entrypoint boolean not null default false,
  is_downloadable boolean not null default false,
  alt_text text check (alt_text is null or char_length(alt_text) <= 240),
  poster_asset_id uuid references public.ds_prompt_assets(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, source_path),
  check (not is_primary or role in ('cover', 'image', 'video', 'web_preview')),
  check (not is_entrypoint or role = 'web_preview')
);

create unique index ds_prompt_assets_primary_idx
  on public.ds_prompt_assets (prompt_id) where is_primary;
create unique index ds_prompt_assets_entrypoint_idx
  on public.ds_prompt_assets (prompt_id) where is_entrypoint;
create index ds_prompt_assets_prompt_order_idx
  on public.ds_prompt_assets (prompt_id, sort, id);
create index ds_prompt_category_links_category_idx
  on public.ds_prompt_category_links (category_id, prompt_id);
create index ds_prompts_public_order_idx
  on public.ds_prompts (status, featured desc, sort desc, published_at desc, id);
create index ds_prompts_kind_idx
  on public.ds_prompts (content_kind, status, featured desc, sort desc, published_at desc, id);
create index ds_prompts_tags_idx on public.ds_prompts using gin (tags);
create index ds_prompts_title_search_idx on public.ds_prompts using gin (title gin_trgm_ops);

create trigger ds_prompt_categories_set_updated_at
before update on public.ds_prompt_categories
for each row execute function app_private.set_updated_at();
create trigger ds_prompts_set_updated_at
before update on public.ds_prompts
for each row execute function app_private.set_updated_at();
create trigger ds_prompt_documents_set_updated_at
before update on public.ds_prompt_documents
for each row execute function app_private.set_updated_at();
create trigger ds_prompt_assets_set_updated_at
before update on public.ds_prompt_assets
for each row execute function app_private.set_updated_at();

insert into public.ds_prompt_categories (slug, name, description, kind, sort)
values
  ('web-ui-prompts', '网页 UI Prompts', '网页界面、设计系统与前端样式提示词', 'web_ui', 90),
  ('image-prompts', '图片 Prompts', '图像生成、摄影、插画与视觉创作提示词', 'image', 80),
  ('video-prompts', '视频 Prompts', '视频生成、镜头、运动与叙事提示词', 'video', 70),
  ('adaptation-prompts', '适配 Prompts', '面向框架、平台和设备的适配方案', 'adaptation', 60)
on conflict (slug) do nothing;

revoke all on public.ds_prompt_categories from public;
revoke all on public.ds_prompts from public;
revoke all on public.ds_prompt_category_links from public;
revoke all on public.ds_prompt_documents from public;
revoke all on public.ds_prompt_assets from public;

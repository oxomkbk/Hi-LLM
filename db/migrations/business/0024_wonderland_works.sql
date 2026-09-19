create table public.wonder_works (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  author_id uuid not null references public.app_users(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 100),
  summary text not null check (char_length(summary) between 20 and 240),
  kind text not null check (kind in ('app', 'game', 'library', 'plugin', 'template', 'other')),
  tags text[] not null default '{}'::text[] check (cardinality(tags) between 0 and 8),
  source_url text not null check (char_length(source_url) <= 2048 and source_url ~ '^https://'),
  demo_url text check (demo_url is null or (char_length(demo_url) <= 2048 and demo_url ~ '^https://')),
  content_version smallint not null default 1 check (content_version = 1),
  content_json jsonb not null check (jsonb_typeof(content_json) = 'object'),
  content_text text not null check (char_length(content_text) between 30 and 30000),
  cover_file_id uuid not null references public.file_objects(id) on delete restrict,
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden', 'deleted')),
  featured boolean not null default false,
  like_count integer not null default 0 check (like_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  published_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'deleted') = (deleted_at is not null)),
  unique (id, author_id)
);

create unique index wonder_works_slug_unique on public.wonder_works (lower(slug));
create index wonder_works_public_idx
  on public.wonder_works (visibility, featured desc, published_at desc, id desc);
create index wonder_works_kind_idx
  on public.wonder_works (kind, visibility, published_at desc, id desc);
create index wonder_works_author_idx
  on public.wonder_works (author_id, visibility, published_at desc, id desc);
create index wonder_works_title_trgm_idx on public.wonder_works using gin (title gin_trgm_ops);
create index wonder_works_summary_trgm_idx on public.wonder_works using gin (summary gin_trgm_ops);
create index wonder_works_tags_idx on public.wonder_works using gin (tags);

create table public.wonder_work_files (
  work_id uuid not null references public.wonder_works(id) on delete cascade,
  file_id uuid not null references public.file_objects(id) on delete restrict,
  position smallint not null check (position between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (work_id, file_id),
  unique (work_id, position)
);

create index wonder_work_files_file_idx on public.wonder_work_files (file_id, work_id);

create table public.wonder_work_likes (
  work_id uuid not null references public.wonder_works(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

create index wonder_work_likes_user_idx
  on public.wonder_work_likes (user_id, created_at desc, work_id);

create table public.wonder_work_view_events (
  id bigint generated always as identity primary key,
  work_id uuid not null references public.wonder_works(id) on delete cascade,
  viewer_hash text not null,
  bucket_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (work_id, viewer_hash, bucket_start)
);

create index wonder_work_view_events_created_idx
  on public.wonder_work_view_events (created_at desc);

create table public.wonder_badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 30),
  description text not null check (char_length(description) between 2 and 120),
  icon text not null check (icon in ('spark', 'layers', 'heart', 'eye', 'crown')),
  tone text not null check (tone in ('ink', 'blue', 'green', 'amber', 'rose')),
  criteria_type text not null check (criteria_type in ('works_published', 'works_likes_received', 'works_views_received')),
  threshold integer not null check (threshold > 0),
  sort smallint not null default 1 check (sort between 1 and 99),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index wonder_badges_slug_unique on public.wonder_badges (lower(slug));
create unique index wonder_badges_criteria_unique
  on public.wonder_badges (criteria_type, threshold);
create index wonder_badges_public_order_idx
  on public.wonder_badges (is_active, sort desc, threshold, id);

create table public.wonder_user_badges (
  user_id uuid not null references public.app_users(id) on delete cascade,
  badge_id uuid not null references public.wonder_badges(id) on delete restrict,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  primary key (user_id, badge_id)
);

create index wonder_user_badges_awarded_idx
  on public.wonder_user_badges (user_id, awarded_at desc, badge_id);

insert into public.wonder_badges (
  slug, name, description, icon, tone, criteria_type, threshold, sort
) values
  ('first-launch', '初次亮相', '发布第一个代码作品', 'spark', 'blue', 'works_published', 1, 99),
  ('steady-maker', '持续创造', '累计发布 3 个代码作品', 'layers', 'green', 'works_published', 3, 90),
  ('portfolio-builder', '作品成册', '累计发布 10 个代码作品', 'crown', 'amber', 'works_published', 10, 80),
  ('community-favorite', '社区喜欢', '作品累计获得 10 次喜欢', 'heart', 'rose', 'works_likes_received', 10, 70),
  ('seen-and-known', '被更多人看见', '作品累计获得 100 次有效浏览', 'eye', 'ink', 'works_views_received', 100, 60)
on conflict (criteria_type, threshold) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tone = excluded.tone,
  sort = excluded.sort,
  is_active = true,
  updated_at = now();

create trigger wonder_works_set_updated_at
before update on public.wonder_works
for each row execute function app_private.set_updated_at();

create trigger wonder_badges_set_updated_at
before update on public.wonder_badges
for each row execute function app_private.set_updated_at();


create table public.wonder_editorial_seed_items (
  seed_key text not null check (seed_key ~ '^[a-z0-9][a-z0-9:_-]{7,159}$'),
  work_id uuid not null unique references public.wonder_works(id) on delete restrict,
  slug text not null,
  source_url text not null check (source_url ~ '^https://github\.com/[^/]+/[^/?#]+$'),
  cover_file_id uuid not null references public.file_objects(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (seed_key)
);

create unique index wonder_editorial_seed_items_slug_unique
  on public.wonder_editorial_seed_items (lower(slug));

create unique index wonder_editorial_seed_items_source_unique
  on public.wonder_editorial_seed_items (lower(source_url));

create index wonder_editorial_seed_items_cover_idx
  on public.wonder_editorial_seed_items (cover_file_id, work_id);

create trigger wonder_editorial_seed_items_set_updated_at
before update on public.wonder_editorial_seed_items
for each row execute function app_private.set_updated_at();

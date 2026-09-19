create table public.wonder_categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('question', 'news')),
  parent_id uuid references public.wonder_categories(id) on delete restrict,
  depth smallint not null default 0 check (depth in (0, 1)),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  icon text,
  sort smallint not null default 1 check (sort between 1 and 99),
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((depth = 0 and parent_id is null) or (scope = 'question' and depth = 1 and parent_id is not null)),
  check (scope <> 'news' or (depth = 0 and parent_id is null))
);

create unique index wonder_categories_scope_slug_unique
  on public.wonder_categories (scope, lower(slug));
create unique index wonder_categories_root_name_unique
  on public.wonder_categories (scope, lower(name)) where parent_id is null;
create unique index wonder_categories_child_name_unique
  on public.wonder_categories (parent_id, lower(name)) where parent_id is not null;
create index wonder_categories_public_order_idx
  on public.wonder_categories (scope, is_active, depth, sort desc, name, id);

create or replace function app_private.validate_wonder_category_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_row public.wonder_categories%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'wonder category cannot reference itself' using errcode = '23514';
  end if;

  select * into parent_row
  from public.wonder_categories
  where id = new.parent_id;

  if not found or parent_row.scope <> 'question' or parent_row.depth <> 0 then
    raise exception 'wonder category parent must be a root question category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger wonder_categories_validate_parent
after insert or update of parent_id, scope, depth on public.wonder_categories
deferrable initially immediate
for each row execute function app_private.validate_wonder_category_parent();

create table public.wonder_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 30),
  description text not null default '' check (char_length(description) <= 300),
  sort smallint not null default 1 check (sort between 1 and 99),
  is_active boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index wonder_tags_slug_unique on public.wonder_tags (lower(slug));
create unique index wonder_tags_name_unique on public.wonder_tags (lower(name));
create index wonder_tags_public_order_idx
  on public.wonder_tags (is_active, sort desc, usage_count desc, name, id);

create table public.wonder_settings (
  id boolean primary key default true check (id = true),
  question_edit_minutes integer not null default 30 check (question_edit_minutes between 0 and 10080),
  answer_edit_minutes integer not null default 30 check (answer_edit_minutes between 0 and 10080),
  comment_edit_minutes integer not null default 15 check (comment_edit_minutes between 0 and 1440),
  questions_per_day integer not null default 10 check (questions_per_day between 1 and 100),
  answers_per_day integer not null default 60 check (answers_per_day between 1 and 500),
  comments_per_day integer not null default 120 check (comments_per_day between 1 and 1000),
  max_question_images smallint not null default 8 check (max_question_images between 0 and 12),
  max_answer_images smallint not null default 8 check (max_answer_images between 0 and 12),
  portal_question_count smallint not null default 20 check (portal_question_count between 5 and 50),
  portal_news_count smallint not null default 6 check (portal_news_count between 1 and 20),
  hot_window_hours integer not null default 168 check (hot_window_hours between 1 and 720),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wonder_settings (id) values (true) on conflict (id) do nothing;

create table public.wonder_questions (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  author_id uuid not null references public.app_users(id) on delete restrict,
  category_id uuid not null references public.wonder_categories(id) on delete restrict,
  title text not null check (char_length(title) between 8 and 160),
  summary text not null check (char_length(summary) between 20 and 300),
  content_version smallint not null default 1 check (content_version = 1),
  content_json jsonb not null check (jsonb_typeof(content_json) = 'object'),
  content_text text not null check (char_length(content_text) between 30 and 30000),
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden', 'deleted')),
  is_closed boolean not null default false,
  is_locked boolean not null default false,
  accepted_answer_id uuid,
  vote_score integer not null default 0,
  hot_score numeric(16, 4) not null default 0,
  answer_count integer not null default 0 check (answer_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  favorite_count integer not null default 0 check (favorite_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),
  last_activity_at timestamptz not null default now(),
  edited_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'deleted') = (deleted_at is not null)),
  unique (id, author_id)
);

create unique index wonder_questions_slug_unique on public.wonder_questions (lower(slug));
create index wonder_questions_activity_idx
  on public.wonder_questions (visibility, is_closed, category_id, last_activity_at desc, id desc);
create index wonder_questions_created_idx
  on public.wonder_questions (visibility, created_at desc, id desc);
create index wonder_questions_hot_idx
  on public.wonder_questions (visibility, hot_score desc, last_activity_at desc, id desc);
create index wonder_questions_author_idx
  on public.wonder_questions (author_id, visibility, created_at desc, id desc);
create index wonder_questions_title_trgm_idx on public.wonder_questions using gin (title gin_trgm_ops);
create index wonder_questions_summary_trgm_idx on public.wonder_questions using gin (summary gin_trgm_ops);

create table public.wonder_question_tags (
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  tag_id uuid not null references public.wonder_tags(id) on delete restrict,
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (question_id, tag_id),
  unique (question_id, position)
);

create index wonder_question_tags_tag_idx
  on public.wonder_question_tags (tag_id, question_id);

create table public.wonder_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  author_id uuid not null references public.app_users(id) on delete restrict,
  content_version smallint not null default 1 check (content_version = 1),
  content_json jsonb not null check (jsonb_typeof(content_json) = 'object'),
  content_text text not null check (char_length(content_text) between 2 and 30000),
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden', 'deleted')),
  vote_score integer not null default 0,
  comment_count integer not null default 0 check (comment_count >= 0),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'deleted') = (deleted_at is not null)),
  unique (id, question_id)
);

create index wonder_answers_question_order_idx
  on public.wonder_answers (question_id, visibility, vote_score desc, created_at, id);
create index wonder_answers_author_idx
  on public.wonder_answers (author_id, visibility, created_at desc, id desc);

alter table public.wonder_questions
  add constraint wonder_questions_accepted_answer_fk
  foreign key (accepted_answer_id, id)
  references public.wonder_answers (id, question_id)
  deferrable initially immediate;

create table public.wonder_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  answer_id uuid,
  parent_id uuid references public.wonder_comments(id) on delete restrict,
  author_id uuid not null references public.app_users(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 2000),
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden', 'deleted')),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'deleted') = (deleted_at is not null)),
  foreign key (answer_id, question_id)
    references public.wonder_answers (id, question_id) on delete cascade
);

create index wonder_comments_question_idx
  on public.wonder_comments (question_id, answer_id, visibility, created_at, id);
create index wonder_comments_parent_idx
  on public.wonder_comments (parent_id, created_at, id) where parent_id is not null;
create index wonder_comments_author_idx
  on public.wonder_comments (author_id, visibility, created_at desc, id desc);

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
    or parent_row.question_id <> new.question_id
    or parent_row.answer_id is distinct from new.answer_id
    or parent_row.parent_id is not null then
    raise exception 'wonder comment parent must be a root comment in the same discussion' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger wonder_comments_validate_parent
after insert or update of parent_id, question_id, answer_id on public.wonder_comments
deferrable initially immediate
for each row execute function app_private.validate_wonder_comment_parent();

create table public.wonder_question_files (
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  file_id uuid not null references public.file_objects(id) on delete restrict,
  position smallint not null check (position between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (question_id, file_id),
  unique (question_id, position)
);

create index wonder_question_files_file_idx on public.wonder_question_files (file_id, question_id);

create table public.wonder_answer_files (
  answer_id uuid not null references public.wonder_answers(id) on delete cascade,
  file_id uuid not null references public.file_objects(id) on delete restrict,
  position smallint not null check (position between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (answer_id, file_id),
  unique (answer_id, position)
);

create index wonder_answer_files_file_idx on public.wonder_answer_files (file_id, answer_id);

create table public.wonder_question_votes (
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index wonder_question_votes_user_idx
  on public.wonder_question_votes (user_id, created_at desc, question_id);

create table public.wonder_answer_votes (
  answer_id uuid not null references public.wonder_answers(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

create index wonder_answer_votes_user_idx
  on public.wonder_answer_votes (user_id, created_at desc, answer_id);

create table public.wonder_question_favorites (
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index wonder_question_favorites_user_idx
  on public.wonder_question_favorites (user_id, created_at desc, question_id);

create table public.wonder_question_follows (
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index wonder_question_follows_user_idx
  on public.wonder_question_follows (user_id, created_at desc, question_id);

create table public.wonder_question_view_events (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.wonder_questions(id) on delete cascade,
  viewer_hash text not null,
  bucket_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (question_id, viewer_hash, bucket_start)
);

create index wonder_question_view_events_created_idx
  on public.wonder_question_view_events (created_at desc);

create table public.wonder_news_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category_id uuid not null references public.wonder_categories(id) on delete restrict,
  author_id uuid not null references public.app_users(id) on delete restrict,
  title text not null check (char_length(title) between 4 and 160),
  summary text not null check (char_length(summary) between 20 and 300),
  content_version smallint not null default 1 check (content_version = 1),
  content_json jsonb not null check (jsonb_typeof(content_json) = 'object'),
  content_text text not null check (char_length(content_text) between 30 and 50000),
  cover_file_id uuid references public.file_objects(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  featured boolean not null default false,
  pinned boolean not null default false,
  sort smallint not null default 1 check (sort between 1 and 99),
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 160),
  scheduled_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null),
  check (status <> 'scheduled' or scheduled_at is not null)
);

create unique index wonder_news_articles_slug_unique on public.wonder_news_articles (lower(slug));
create index wonder_news_articles_public_idx
  on public.wonder_news_articles (status, pinned desc, sort desc, published_at desc, id desc);
create index wonder_news_articles_category_idx
  on public.wonder_news_articles (category_id, status, published_at desc, id desc);
create index wonder_news_articles_title_trgm_idx
  on public.wonder_news_articles using gin (title gin_trgm_ops);

create table public.wonder_news_files (
  article_id uuid not null references public.wonder_news_articles(id) on delete cascade,
  file_id uuid not null references public.file_objects(id) on delete restrict,
  position smallint not null check (position between 0 and 19),
  created_at timestamptz not null default now(),
  primary key (article_id, file_id),
  unique (article_id, position)
);

create index wonder_news_files_file_idx on public.wonder_news_files (file_id, article_id);

create table public.wonder_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.app_users(id) on delete restrict,
  question_id uuid references public.wonder_questions(id) on delete cascade,
  answer_id uuid references public.wonder_answers(id) on delete cascade,
  comment_id uuid references public.wonder_comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'illegal', 'misinformation', 'privacy', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  assignee_id uuid references public.app_users(id) on delete set null,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(question_id, answer_id, comment_id) = 1)
);

create unique index wonder_reports_open_question_unique
  on public.wonder_reports (reporter_id, question_id)
  where question_id is not null and status in ('pending', 'reviewing');
create unique index wonder_reports_open_answer_unique
  on public.wonder_reports (reporter_id, answer_id)
  where answer_id is not null and status in ('pending', 'reviewing');
create unique index wonder_reports_open_comment_unique
  on public.wonder_reports (reporter_id, comment_id)
  where comment_id is not null and status in ('pending', 'reviewing');
create index wonder_reports_queue_idx
  on public.wonder_reports (status, created_at, id);

create table public.wonder_moderation_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.app_users(id) on delete restrict,
  question_id uuid references public.wonder_questions(id) on delete set null,
  answer_id uuid references public.wonder_answers(id) on delete set null,
  comment_id uuid references public.wonder_comments(id) on delete set null,
  file_id uuid references public.file_objects(id) on delete set null,
  action text not null check (action in (
    'hide', 'restore', 'delete', 'close', 'reopen', 'lock', 'unlock',
    'accept', 'unaccept', 'resolve-report', 'dismiss-report', 'block-file'
  )),
  reason text not null check (char_length(reason) between 2 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(question_id, answer_id, comment_id, file_id) >= 1)
);

create index wonder_moderation_events_question_idx
  on public.wonder_moderation_events (question_id, created_at desc) where question_id is not null;
create index wonder_moderation_events_created_idx
  on public.wonder_moderation_events (created_at desc, id desc);

create table public.wonder_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.app_users(id) on delete cascade,
  actor_id uuid references public.app_users(id) on delete set null,
  type text not null check (type in (
    'new-answer', 'new-comment', 'answer-accepted', 'answer-unaccepted',
    'question-closed', 'question-reopened', 'content-moderated'
  )),
  question_id uuid references public.wonder_questions(id) on delete cascade,
  answer_id uuid references public.wonder_answers(id) on delete cascade,
  comment_id uuid references public.wonder_comments(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create index wonder_notifications_recipient_idx
  on public.wonder_notifications (recipient_id, read_at, created_at desc, id desc);

create table public.wonder_idempotency_keys (
  actor_id uuid not null references public.app_users(id) on delete cascade,
  action text not null,
  key uuid not null,
  request_hash text not null,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  primary key (actor_id, action, key),
  check ((resource_type is null) = (resource_id is null))
);

create index wonder_idempotency_keys_expiry_idx on public.wonder_idempotency_keys (expires_at);

create trigger wonder_categories_set_updated_at before update on public.wonder_categories
for each row execute function app_private.set_updated_at();
create trigger wonder_tags_set_updated_at before update on public.wonder_tags
for each row execute function app_private.set_updated_at();
create trigger wonder_settings_set_updated_at before update on public.wonder_settings
for each row execute function app_private.set_updated_at();
create trigger wonder_questions_set_updated_at before update on public.wonder_questions
for each row execute function app_private.set_updated_at();
create trigger wonder_answers_set_updated_at before update on public.wonder_answers
for each row execute function app_private.set_updated_at();
create trigger wonder_comments_set_updated_at before update on public.wonder_comments
for each row execute function app_private.set_updated_at();
create trigger wonder_question_votes_set_updated_at before update on public.wonder_question_votes
for each row execute function app_private.set_updated_at();
create trigger wonder_answer_votes_set_updated_at before update on public.wonder_answer_votes
for each row execute function app_private.set_updated_at();
create trigger wonder_news_articles_set_updated_at before update on public.wonder_news_articles
for each row execute function app_private.set_updated_at();
create trigger wonder_reports_set_updated_at before update on public.wonder_reports
for each row execute function app_private.set_updated_at();

revoke all on function app_private.validate_wonder_category_parent() from public;
revoke all on function app_private.validate_wonder_comment_parent() from public;

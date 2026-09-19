alter table public.ds_prompts
  add column if not exists submission_origin text not null default 'admin'
    check (submission_origin in ('admin', 'community')),
  add column if not exists submitted_at timestamptz;

update public.ds_prompts
set submitted_at = coalesce(submitted_at, created_at)
where submission_origin = 'community';

create index if not exists ds_prompts_submission_queue_idx
  on public.ds_prompts (submission_origin, submitted_at desc, created_at desc)
  where status = 'draft';

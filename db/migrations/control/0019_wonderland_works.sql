alter table auth."user"
  add column if not exists "canPublishWorks" boolean not null default true;

alter table control.wonder_rate_buckets
  drop constraint if exists wonder_rate_buckets_action_check;

alter table control.wonder_rate_buckets
  add constraint wonder_rate_buckets_action_check check (action in (
    'admin-mutate',
    'answer-accept',
    'answer-create',
    'answer-vote',
    'comment-create',
    'question-create',
    'question-engage',
    'question-view',
    'question-vote',
    'report-create',
    'work-create',
    'work-like',
    'work-view'
  ));

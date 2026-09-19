alter table public.wonder_work_moderation_events
  drop constraint if exists wonder_work_moderation_events_action_check;

alter table public.wonder_work_moderation_events
  add constraint wonder_work_moderation_events_action_check
  check (action in ('delete', 'hide', 'restore'));

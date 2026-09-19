alter table control.user_profile_appearances
  drop constraint if exists user_profile_appearances_preset_check;

alter table control.user_profile_appearances
  alter column preset set default 'apple-studio';

-- Existing rows are explicit user choices and remain untouched. New profiles and
-- the editor's “restore default” action use the new default after this migration.

alter table control.user_profile_appearances
  add constraint user_profile_appearances_preset_check check (preset in (
    'apple-studio', 'daybreak', 'sea-glass', 'peach-haze', 'lime-air'
  ));

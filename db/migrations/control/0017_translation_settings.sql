alter table control.site_access_settings
  add column if not exists translation_enabled boolean not null default true,
  add column if not exists translation_languages text[] not null default ARRAY[
    'chinese_simplified',
    'chinese_traditional',
    'english',
    'japanese',
    'korean',
    'french',
    'deutsch',
    'spanish',
    'portuguese',
    'russian',
    'arabic',
    'vietnamese'
  ]::text[],
  add column if not exists translation_default_language text not null default 'chinese_simplified';

alter table control.site_access_settings
  drop constraint if exists site_access_settings_translation_languages_check,
  drop constraint if exists site_access_settings_translation_default_check,
  add constraint site_access_settings_translation_languages_check check (
    cardinality(translation_languages) between 1 and 12
    and translation_languages @> ARRAY['chinese_simplified']::text[]
    and translation_languages <@ ARRAY[
      'chinese_simplified',
      'chinese_traditional',
      'english',
      'japanese',
      'korean',
      'french',
      'deutsch',
      'spanish',
      'portuguese',
      'russian',
      'arabic',
      'vietnamese'
    ]::text[]
  ),
  add constraint site_access_settings_translation_default_check check (
    translation_default_language = any(translation_languages)
  );

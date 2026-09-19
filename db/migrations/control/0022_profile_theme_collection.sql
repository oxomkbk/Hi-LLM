alter table control.user_profile_appearances
  drop constraint if exists user_profile_appearances_preset_check;

alter table control.user_profile_appearances
  add constraint user_profile_appearances_preset_check check (preset in (
    'apple-studio',
    'sea-glass',
    'carbon-forge',
    'polar-signal',
    'lime-air',
    'daybreak',
    'peach-haze',
    'sakura-silk',
    'wisteria-dusk',
    'lacquer-gold'
  ));

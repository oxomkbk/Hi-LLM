alter table control.user_profile_appearances
  drop constraint if exists user_profile_appearances_preset_check;

alter table control.user_profile_appearances
  add constraint user_profile_appearances_preset_check
  check (
    preset in (
      'apple-studio',
      'spatial-orbit',
      'sea-glass',
      'quantum-core',
      'carbon-forge',
      'polar-signal',
      'neon-district',
      'terminal-zero',
      'lime-air',
      'daybreak',
      'peach-haze',
      'sakura-silk',
      'candy-cloud',
      'wisteria-dusk',
      'lacquer-gold'
    )
  );

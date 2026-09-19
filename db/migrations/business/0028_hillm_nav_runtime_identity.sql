update public.ds_ai_security_settings
set required_worker_generation = 'hillm-nav-security-worker@2026-08-28.1',
    service_state_version = service_state_version + 1,
    service_state_changed_at = now(),
    updated_at = now()
where id = true
  and required_worker_generation like 'better-nav-security-worker@%';

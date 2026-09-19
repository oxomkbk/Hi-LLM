with changed as (
  update public.ds_ai_security_settings
  set adapter_versions = adapter_versions
        || '{
          "mcp": {
            "adapter": "mcp-config-static-v1",
            "normalizer": "platform-finding-v1",
            "rules": "mcp-config-rules-v1",
            "scanner": "better-nav-mcp-static@1"
          },
          "prompt": {
            "adapter": "prompt-static-v1",
            "normalizer": "platform-finding-v1",
            "rules": "prompt-safety-rules-v1",
            "scanner": "better-nav-prompt-static@1"
          }
        }'::jsonb,
      -- A settings save recomputes these canonical fingerprints using the new
      -- adapter identities. Removing the old values keeps the worker fail-closed
      -- until an administrator reviews and saves the modes.
      required_scanner_config_fingerprints = required_scanner_config_fingerprints - 'mcp' - 'prompt',
      settings_version = settings_version + 1,
      updated_at = now()
  where id = true
    and (
      adapter_versions -> 'mcp' is distinct from '{
        "adapter": "mcp-config-static-v1",
        "normalizer": "platform-finding-v1",
        "rules": "mcp-config-rules-v1",
        "scanner": "better-nav-mcp-static@1"
      }'::jsonb
      or adapter_versions -> 'prompt' is distinct from '{
        "adapter": "prompt-static-v1",
        "normalizer": "platform-finding-v1",
        "rules": "prompt-safety-rules-v1",
        "scanner": "better-nav-prompt-static@1"
      }'::jsonb
    )
  returning id
)
update public.ds_ai_security_subject_states
set report_state = case when latest_assessment_id is null then 'unassessed' else 'stale' end,
    score = null,
    grade = null,
    verdict = null,
    stale_at = case when latest_assessment_id is null then stale_at else now() end,
    row_version = row_version + 1
where subject_type in ('mcp', 'mcp_submission', 'prompt')
  and exists (select 1 from changed);

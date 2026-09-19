-- The v2 static rules distinguish declared utility capabilities from confirmed
-- destructive or exfiltration behaviour. Existing Skill reports are stale until
-- they are evaluated under the new classification contract.
with changed as (
  update public.ds_ai_security_settings
  set adapter_versions = jsonb_set(
        adapter_versions,
        '{skill,rules}',
        to_jsonb('skilltrustbench-t01-t09+trusted-eval-v1+platform-static-v2'::text),
        true
      ),
      required_scanner_config_fingerprints = jsonb_set(
        required_scanner_config_fingerprints,
        '{skill}',
        to_jsonb(encode(digest(
          coalesce(required_scanner_config_fingerprints ->> 'skill', '')
            || ':platform-static-v2',
          'sha256'
        ), 'hex')),
        true
      ),
      required_worker_generation = 'better-nav-security-worker@2026-08-24.1',
      service_state_version = service_state_version + 1,
      service_state_changed_at = now(),
      service_state_changed_by = null,
      settings_version = settings_version + 1,
      updated_at = now()
  where id = true
  returning id
)
update public.ds_ai_security_subject_states
set report_state = case when latest_assessment_id is null then 'unassessed' else 'stale' end,
    score = null,
    grade = null,
    verdict = null,
    stale_at = case when latest_assessment_id is null then stale_at else now() end,
    row_version = row_version + 1,
    updated_at = now()
where subject_type in ('skill', 'skill_submission')
  and exists (select 1 from changed);

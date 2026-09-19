with expected as (
  select '{
    "skill": "skilltrustbench-t01-t09+priority-material+document-evidence-v4-scope-aware-directives",
    "mcp": "mcp-config+priority-source+document-evidence-v4-scope-aware-directives"
  }'::jsonb as rules
), changed as (
  update public.ds_ai_security_settings settings
  set adapter_versions = jsonb_set(
        jsonb_set(settings.adapter_versions, '{skill,rules}', expected.rules -> 'skill', true),
        '{mcp,rules}', expected.rules -> 'mcp', true
      ),
      service_state_version = settings.service_state_version + 1,
      service_state_changed_at = now(),
      service_state_changed_by = null,
      settings_version = settings.settings_version + 1,
      updated_at = now()
  from expected
  where settings.id = true
    and (
      settings.adapter_versions #>> '{skill,rules}' is distinct from expected.rules ->> 'skill'
      or settings.adapter_versions #>> '{mcp,rules}' is distinct from expected.rules ->> 'mcp'
    )
  returning settings.id
)
update public.ds_ai_security_subject_states state
set report_state = case when state.latest_assessment_id is null then 'unassessed' else 'stale' end,
    score = null,
    grade = null,
    verdict = null,
    stale_at = case when state.latest_assessment_id is null then state.stale_at else now() end,
    row_version = state.row_version + 1,
    updated_at = now()
where state.subject_type in ('skill', 'skill_submission', 'mcp', 'mcp_submission')
  and exists (select 1 from changed);

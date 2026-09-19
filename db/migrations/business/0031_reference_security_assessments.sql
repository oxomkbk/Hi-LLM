alter table public.ds_ai_security_assessments
  drop constraint if exists ds_ai_security_assessments_evaluation_method_check;

alter table public.ds_ai_security_assessments
  add constraint ds_ai_security_assessments_evaluation_method_check
  check (evaluation_method is null or evaluation_method in ('hybrid', 'deterministic', 'document_evidence'));

comment on column public.ds_ai_security_assessments.evaluation_method is
  'hybrid for AI-assisted quality review; document_evidence for local README, SKILL, manifest and configuration evidence; deterministic for legacy evidence-only reports.';

with expected as (
  select '{
    "skill": {
      "adapter": "skill-priority-material-v3",
      "normalizer": "skill-sarif-v1",
      "rules": "skilltrustbench-t01-t09+priority-material+document-evidence-v1",
      "scanner": "aig-skill-scan@0.2.1"
    },
    "mcp": {
      "adapter": "mcp-priority-material-v3",
      "normalizer": "platform-finding-v1",
      "rules": "mcp-config+priority-source+document-evidence-v1",
      "scanner": "hillm-nav-mcp-trust@2"
    },
    "prompt": {
      "adapter": "prompt-document-evidence-v3",
      "normalizer": "platform-finding-v1",
      "rules": "prompt-safety-rules+document-evidence-v1",
      "scanner": "hillm-nav-prompt-trust@2"
    }
  }'::jsonb as versions
), changed as (
  update public.ds_ai_security_settings settings
  set adapter_versions = settings.adapter_versions || expected.versions,
      service_state_version = settings.service_state_version + 1,
      service_state_changed_at = now(),
      service_state_changed_by = null,
      settings_version = settings.settings_version + 1,
      updated_at = now()
  from expected
  where settings.id = true
    and (
      settings.adapter_versions -> 'skill' is distinct from expected.versions -> 'skill'
      or settings.adapter_versions -> 'mcp' is distinct from expected.versions -> 'mcp'
      or settings.adapter_versions -> 'prompt' is distinct from expected.versions -> 'prompt'
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
where exists (select 1 from changed);

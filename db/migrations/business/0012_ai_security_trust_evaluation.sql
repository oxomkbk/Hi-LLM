alter table public.ds_ai_security_assessments
  add column quality_score numeric(3, 2)
    check (quality_score is null or quality_score between 0 and 5),
  add column quality_rating text
    check (quality_rating is null or quality_rating in ('exceptional', 'excellent', 'good', 'fair', 'poor')),
  add column evaluation_summary text
    check (evaluation_summary is null or char_length(evaluation_summary) <= 4000),
  add column evaluation_schema_version text
    check (evaluation_schema_version is null or char_length(evaluation_schema_version) between 1 and 80),
  add column evaluation_method text
    check (evaluation_method is null or evaluation_method in ('hybrid')),
  add column evaluation_model text
    check (evaluation_model is null or char_length(evaluation_model) between 1 and 200);

create table public.ds_ai_security_dimension_scores (
  assessment_id uuid not null references public.ds_ai_security_assessments(id) on delete cascade,
  dimension text not null
    check (dimension in ('safety', 'reliability', 'applicability', 'maintainability', 'effectiveness')),
  score numeric(3, 2) not null check (score between 0 and 5),
  summary text not null check (char_length(summary) between 1 and 2000),
  strengths text[] not null default '{}'::text[],
  weaknesses text[] not null default '{}'::text[],
  recommendations text[] not null default '{}'::text[],
  evidence text[] not null default '{}'::text[],
  source text not null check (source in ('deterministic', 'ai_assisted')),
  display_order smallint not null check (display_order between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (assessment_id, dimension)
);

create index ds_ai_security_dimension_scores_assessment_order_idx
  on public.ds_ai_security_dimension_scores (assessment_id, display_order);

revoke all on public.ds_ai_security_dimension_scores from public;

with changed as (
  update public.ds_ai_security_settings
  set adapter_versions = adapter_versions
        || '{
          "skill": {
            "adapter": "skill-source-trust-v2",
            "normalizer": "skill-sarif-v1",
            "rules": "skilltrustbench-t01-t09+trusted-eval-v1",
            "scanner": "aig-skill-scan@0.2.1"
          },
          "mcp": {
            "adapter": "mcp-config-trust-v2",
            "normalizer": "platform-finding-v1",
            "rules": "mcp-config-rules+trusted-eval-v1",
            "scanner": "better-nav-mcp-trust@2"
          },
          "prompt": {
            "adapter": "prompt-trust-v2",
            "normalizer": "platform-finding-v1",
            "rules": "prompt-safety-rules+trusted-eval-v1",
            "scanner": "better-nav-prompt-trust@2"
          }
        }'::jsonb,
      required_scanner_config_fingerprints = '{}'::jsonb,
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
    row_version = row_version + 1
where exists (select 1 from changed);

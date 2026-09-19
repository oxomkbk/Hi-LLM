-- Deterministic scans produce auditable security evidence, not inferred quality.
-- The migration runner wraps this file in a transaction. Disable the terminal-row
-- immutability trigger only while removing the obsolete derived quality fields;
-- findings, coverage, scores used by the publish gate, status and bindings remain intact.
alter table public.ds_ai_security_assessments
  disable trigger ds_ai_security_assessments_transition;

delete from public.ds_ai_security_dimension_scores dimension
using public.ds_ai_security_assessments assessment
where dimension.assessment_id = assessment.id
  and assessment.evaluation_method = 'deterministic';

update public.ds_ai_security_assessments
set quality_score = null,
    quality_rating = null,
    evaluation_summary = null,
    evaluation_schema_version = 'security-evidence-v1',
    evaluation_model = 'platform-static-rules-v2'
where evaluation_method = 'deterministic'
  and (
    quality_score is not null
    or quality_rating is not null
    or evaluation_summary is not null
    or evaluation_schema_version is distinct from 'security-evidence-v1'
    or evaluation_model is distinct from 'platform-static-rules-v2'
  );

alter table public.ds_ai_security_assessments
  enable trigger ds_ai_security_assessments_transition;

comment on column public.ds_ai_security_assessments.evaluation_method is
  'hybrid when semantic quality evaluation completed; deterministic for evidence-only static security reports without quality scores.';

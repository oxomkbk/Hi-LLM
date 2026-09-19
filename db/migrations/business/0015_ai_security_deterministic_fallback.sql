alter table public.ds_ai_security_assessments
  drop constraint if exists ds_ai_security_assessments_evaluation_method_check;

alter table public.ds_ai_security_assessments
  add constraint ds_ai_security_assessments_evaluation_method_check
  check (evaluation_method is null or evaluation_method in ('hybrid', 'deterministic'));

comment on column public.ds_ai_security_assessments.evaluation_method is
  'hybrid when AI quality review completed; deterministic when the report completed with conservative platform rules only.';

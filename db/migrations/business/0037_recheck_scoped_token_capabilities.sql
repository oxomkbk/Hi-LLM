update public.ds_ai_security_subject_states state
set report_state = 'stale',
    score = null,
    grade = null,
    verdict = null,
    stale_at = now(),
    row_version = state.row_version + 1,
    updated_at = now()
where state.subject_type = 'skill'
  and exists (
    select 1
    from public.ds_ai_security_assessments assessment
    join public.ds_ai_security_findings finding on finding.assessment_id = assessment.id
    where assessment.id = state.latest_assessment_id
      and assessment.rules_version = 'skilltrustbench-t01-t09+priority-material+document-evidence-v6-scoped-credentials'
      and finding.risk_code = 'SKILL_BROAD_SECRET_ACCESS'
  );

-- Reclassify historical reports under the danger-only publishing policy.
-- Scores and immutable findings stay unchanged; only the current publishing
-- conclusion changes when every remaining finding is advisory.
with advisory_reports as (
  select state.subject_type, state.subject_id
  from public.ds_ai_security_subject_states state
  where state.report_state in ('review_required', 'blocked')
    and state.latest_assessment_id is not null
    and not exists (
      select 1
      from public.ds_ai_security_findings finding
      where finding.assessment_id = state.latest_assessment_id
        and (
          finding.severity = 'critical'
          or finding.risk_code in (
            'MCP_DANGEROUS_COMMAND',
            'MCP_SHELL_INJECTION',
            'PROMPT_EXECUTABLE_ASSET',
            'PROMPT_OBFUSCATED_EXECUTION',
            'SKILL_EXECUTABLE_FILE',
            'SKILL_OBFUSCATED_EXECUTION'
          )
          or (
            finding.severity = 'high'
            and finding.risk_code not in (
              'PROMPT_INSTRUCTION_OVERRIDE',
              'PROMPT_SECRET_REQUEST',
              'SKILL_INSTRUCTION_OVERRIDE'
            )
          )
        )
        and not exists (
          select 1
          from public.ds_ai_security_finding_reviews review
          where review.finding_id = finding.id
            and review.decision in ('false_positive', 'false_positive_approved')
            and not exists (
              select 1
              from public.ds_ai_security_finding_reviews reopened
              where reopened.review_of_id = review.id
                and reopened.decision = 'reopen'
            )
        )
    )
)
update public.ds_ai_security_subject_states state
set report_state = 'passed',
    verdict = 'passed',
    row_version = row_version + 1,
    updated_at = now()
from advisory_reports report
where state.subject_type = report.subject_type
  and state.subject_id = report.subject_id;

comment on column public.ds_ai_security_subject_states.report_state is
  'Current automated publishing conclusion. Advisory findings affect score and guidance but do not require manual review.';

-- Fence older worker processes because this migration changes the persisted
-- verdict contract. Existing processes can no longer claim queued jobs.
update public.ds_ai_security_settings
set required_worker_generation = 'better-nav-security-worker@2026-08-22.2',
    service_state_version = service_state_version + 1,
    service_state_changed_at = now(),
    service_state_changed_by = null,
    updated_at = now()
where id = true;

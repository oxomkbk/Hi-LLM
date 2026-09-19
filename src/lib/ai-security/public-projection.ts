export function securityJoins(subjectAlias: string, subjectType: 'mcp' | 'prompt' | 'skill') {
  return `
    left join public.ds_ai_security_subject_states security_state
      on security_state.subject_type = '${subjectType}' and security_state.subject_id = ${subjectAlias}.id
    left join public.ds_ai_security_assessments security_active
      on security_active.id = security_state.active_assessment_id
    left join public.ds_ai_security_assessments security_report
      on security_report.id = security_state.latest_assessment_id
    left join public.ds_ai_security_settings security_settings on security_settings.id = true
  `
}

export function securityProjection(publicView: boolean) {
  const visible = (setting: string, expression: string) => publicView
    ? `case when security_settings.${setting} then ${expression} else null end`
    : expression
  return `
    security_state.report_state as security_report_state,
    ${visible('public_show_score', 'security_state.score')} as security_score,
    ${visible('public_show_grade', 'security_state.grade')} as security_grade,
    ${visible('public_show_risk_counts', 'security_state.critical_count')} as security_critical_count,
    ${visible('public_show_risk_counts', 'security_state.high_count')} as security_high_count,
    ${visible('public_show_risk_counts', 'security_state.medium_count')} as security_medium_count,
    ${visible('public_show_risk_counts', 'security_state.low_count')} as security_low_count,
    ${visible('public_show_risk_counts', 'security_state.info_count')} as security_info_count,
    security_state.assessed_at as security_assessed_at,
    coalesce(security_state.active_assessment_id, security_state.latest_assessment_id) as security_assessment_id,
    security_active.status as security_scan_status,
    ${securityCoverageProjection(publicView)} as security_coverage,
    ${visible('public_show_summary', 'security_report.summary')} as security_summary,
    ${visible('public_show_score', 'security_report.quality_score::float8')} as security_quality_score,
    ${visible('public_show_grade', 'security_report.quality_rating')} as security_quality_rating,
    ${visible('public_show_summary', 'security_report.evaluation_summary')} as security_evaluation_summary,
    security_report.evaluation_schema_version as security_evaluation_schema_version,
    security_report.evaluation_method as security_evaluation_method,
    ${visible('public_show_summary', `(select coalesce(jsonb_agg(jsonb_build_object(
      'code', dimension.dimension,
      'score', dimension.score::float8,
      'summary', dimension.summary,
      'strengths', dimension.strengths,
      'weaknesses', dimension.weaknesses,
      'recommendations', dimension.recommendations,
      'evidence', dimension.evidence,
      'source', dimension.source
    ) order by dimension.display_order), '[]'::jsonb)
    from public.ds_ai_security_dimension_scores dimension
    where dimension.assessment_id = security_report.id)`)} as security_dimensions,
    coalesce(security_settings.public_show_score, false) as security_show_score,
    coalesce(security_settings.public_show_grade, false) as security_show_grade,
    coalesce(security_settings.public_show_risk_counts, false) as security_show_risk_counts,
    coalesce(security_settings.public_show_summary, false) as security_show_summary
  `.trim()
}

function securityCoverageProjection(publicView: boolean) {
  if (!publicView)
    return 'security_report.coverage'

  return `case
    when security_report.coverage is null then null
    else (security_report.coverage - 'skipped') || jsonb_build_object(
      'skipped', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'ref', skipped.item ->> 'ref',
          'reason', case
            when skipped.item ->> 'ref' in ('runtime/not-executed', 'mcp/runtime-dynamic-assessment', 'skill/isolated-deep-scanner')
              then '未执行第三方代码、安装命令或远程服务；当前结论基于已纳入材料。'
            when skipped.item ->> 'ref' in ('mcp/source-reference-pending', 'skill/source-unavailable', 'skill/external-source-page')
              then '当前以站内资料为依据；使用前建议核对公开来源与权限范围。'
            when skipped.item ->> 'ref' in ('mcp/priority-material-only', 'skill/priority-material-only')
              then '仅纳入与用途、安装、配置和安全相关的优先材料，未遍历全部源码。'
            when skipped.item ->> 'ref' = 'skill/text-budget'
              then '材料较长，本次仅纳入优先部分；使用前建议核对完整说明。'
            when skipped.item ->> 'ref' like 'asset-content:%'
              then '附件未被执行；使用前建议核对附件来源与内容。'
            else '当前材料未覆盖此项，使用前建议核对来源与权限范围。'
          end
        )), '[]'::jsonb)
        from jsonb_array_elements(coalesce(security_report.coverage -> 'skipped', '[]'::jsonb)) as skipped(item)
      )
    )
  end`
}

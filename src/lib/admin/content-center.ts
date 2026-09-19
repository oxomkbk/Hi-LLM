import 'server-only'

import { queryBusiness } from '@/lib/db/business'

import type {
  AdminContentItem,
  AdminContentPage,
  AdminContentSecurityFilter,
  AdminContentStatus,
  AdminContentType,
} from './content-center.shared'

interface AdminContentFilters {
  limit: number
  offset: number
  q?: string
  security?: AdminContentSecurityFilter
  status?: AdminContentStatus
  type?: AdminContentType
}

interface AdminContentRow {
  created_at: Date
  featured: boolean
  id: string
  owner: string
  published_at: Date | null
  security_report_state: AdminContentItem['securityReportState']
  security_scan_status: AdminContentItem['securityScanStatus']
  security_score: number | null
  slug: string
  status: AdminContentStatus
  summary: string
  title: string
  type: AdminContentType
  updated_at: Date
  visual: string | null
}

interface AvailabilityRow {
  assessments: string | null
  mcps: string | null
  prompts: string | null
  security_states: string | null
  skills: string | null
}

interface CountRow {
  status: AdminContentStatus
  total: string
  type: AdminContentType
}

export async function listAdminContent(filters: AdminContentFilters): Promise<AdminContentPage> {
  const availability = await loadAvailability()
  const contentsCte = buildContentsCte(availability)
  const securityAvailable = Boolean(availability.security_states && availability.assessments)
  const { values, where } = buildFilters(filters, securityAvailable)
  const countValues = [...values]
  const listValues = [...values, filters.limit, filters.offset]
  const securityJoins = securityAvailable
    ? `left join public.ds_ai_security_subject_states security_state
         on security_state.subject_type = content.type and security_state.subject_id = content.id
       left join public.ds_ai_security_assessments security_active
         on security_active.id = security_state.active_assessment_id`
    : ''
  const securityProjection = securityAvailable
    ? `security_state.report_state as security_report_state,
       security_state.score::float8 as security_score,
       security_active.status as security_scan_status`
    : `null::text as security_report_state,
       null::float8 as security_score,
       null::text as security_scan_status`

  const [countResult, listResult, summaryResult] = await Promise.all([
    queryBusiness<{ total: string }>(`${contentsCte}
      select count(*)::text as total
      from contents content
      ${securityJoins}
      ${where}
    `, countValues),
    queryBusiness<AdminContentRow>(`${contentsCte}
      select content.*,
             ${securityProjection}
      from contents content
      ${securityJoins}
      ${where}
      order by content.updated_at desc, content.id
      limit $${listValues.length - 1} offset $${listValues.length}
    `, listValues),
    queryBusiness<CountRow>(`${contentsCte}
      select type, status, count(*)::text as total
      from contents
      group by type, status
    `),
  ])

  const summary = {
    byStatus: { archived: 0, draft: 0, published: 0 },
    byType: { mcp: 0, prompt: 0, skill: 0 },
    total: 0,
  }
  for (const row of summaryResult.rows) {
    const total = Number(row.total)
    summary.byType[row.type] += total
    summary.byStatus[row.status] += total
    summary.total += total
  }
  const availabilityByType = {
    mcp: availability.mcps,
    prompt: availability.prompts,
    skill: availability.skills,
  }

  return {
    list: listResult.rows.map(mapRow),
    page: Math.floor(filters.offset / filters.limit) + 1,
    pageSize: filters.limit,
    summary,
    total: Number(countResult.rows[0]?.total ?? 0),
    unavailableTypes: (['skill', 'mcp', 'prompt'] as const).filter(type => !availabilityByType[type]),
  }
}

function buildContentsCte(availability: AvailabilityRow) {
  const sources: string[] = []
  if (availability.skills) {
    sources.push(`select skill.id, 'skill'::text as type, skill.name as title, skill.slug,
                         skill.summary, skill.icon as visual, skill.status, skill.featured, skill.author_name as owner,
                         skill.created_at, skill.updated_at, skill.published_at
                  from public.ds_skills skill`)
  }
  if (availability.mcps) {
    sources.push(`select mcp.id, 'mcp'::text as type, mcp.name as title, mcp.slug,
                         mcp.summary, mcp.icon as visual, mcp.status, mcp.featured, mcp.publisher_name as owner,
                         mcp.created_at, mcp.updated_at, mcp.published_at
                  from public.ds_mcps mcp`)
  }
  if (availability.prompts) {
    sources.push(`select prompt.id, 'prompt'::text as type, prompt.title, prompt.slug,
                         prompt.summary,
                         (select 'file:' || asset.file_id::text
                            from public.ds_prompt_assets asset
                            join public.file_objects file_object on file_object.id = asset.file_id
                           where asset.prompt_id = prompt.id
                             and file_object.status = 'ready'
                             and file_object.mime_type like 'image/%'
                           order by asset.is_primary desc, asset.sort, asset.id
                           limit 1) as visual,
                         prompt.status, prompt.featured,
                         case when prompt.submission_origin = 'community' then '社区投稿' else '后台创建' end as owner,
                         prompt.created_at, prompt.updated_at, prompt.published_at
                  from public.ds_prompts prompt`)
  }
  if (!sources.length) {
    sources.push(`select null::uuid as id, null::text as type, null::text as title,
                         null::text as slug, null::text as summary, null::text as visual, null::text as status,
                         false as featured, null::text as owner, now() as created_at,
                         now() as updated_at, null::timestamptz as published_at
                  where false`)
  }
  return `with contents as (${sources.join(' union all ')})`
}

function buildFilters(filters: AdminContentFilters, securityAvailable: boolean) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (value: unknown, condition: (placeholder: string) => string) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }

  if (filters.type)
    add(filters.type, placeholder => `content.type = ${placeholder}`)
  if (filters.status)
    add(filters.status, placeholder => `content.status = ${placeholder}`)
  if (filters.q)
    add(`%${filters.q}%`, placeholder => `(content.title ilike ${placeholder} or content.summary ilike ${placeholder} or content.slug ilike ${placeholder} or content.owner ilike ${placeholder})`)

  if (!securityAvailable) {
    if (filters.security && filters.security !== 'all' && filters.security !== 'unassessed')
      conditions.push('false')
  }
  else {
    if (filters.security === 'active')
      conditions.push(`security_active.status in ('preparing', 'queued', 'running')`)
    else if (filters.security === 'attention')
      conditions.push(`security_state.report_state in ('blocked', 'failed', 'review_required', 'stale')`)
    else if (filters.security === 'passed')
      conditions.push(`security_state.report_state = 'passed'`)
    else if (filters.security === 'unassessed')
      conditions.push(`coalesce(security_state.report_state, 'unassessed') = 'unassessed'`)
  }

  return {
    values,
    where: conditions.length ? `where ${conditions.join(' and ')}` : '',
  }
}

async function loadAvailability() {
  const result = await queryBusiness<AvailabilityRow>(`
    select to_regclass('public.ds_skills')::text as skills,
           to_regclass('public.ds_mcps')::text as mcps,
           to_regclass('public.ds_prompts')::text as prompts,
           to_regclass('public.ds_ai_security_subject_states')::text as security_states,
           to_regclass('public.ds_ai_security_assessments')::text as assessments
  `)
  return result.rows[0] ?? { assessments: null, mcps: null, prompts: null, security_states: null, skills: null }
}

function mapRow(row: AdminContentRow): AdminContentItem {
  return {
    createdAt: row.created_at.toISOString(),
    featured: row.featured,
    id: row.id,
    owner: row.owner,
    publishedAt: row.published_at?.toISOString() ?? null,
    securityReportState: row.security_report_state,
    securityScanStatus: row.security_scan_status,
    securityScore: row.security_score === null ? null : Number(row.security_score),
    slug: row.slug,
    status: row.status,
    summary: row.summary,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at.toISOString(),
    visual: row.visual,
  }
}

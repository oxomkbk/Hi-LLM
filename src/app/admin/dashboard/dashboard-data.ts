import 'server-only'

import { getSecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode, queryBusiness } from '@/lib/db/business'
import { getControlPool } from '@/lib/db/control'

import { addDays, fillDailySeries } from './admin-analytics-model'

import type { AdminAnalyticsMetricId, AdminAnalyticsPoint, AdminAnalyticsSeries } from './admin-analytics-model'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

export interface AdminDashboardAudience {
  activeSites7d: number
  activeUsers7d: number
  analytics: Record<AdminAnalyticsMetricId, AdminAnalyticsSeries>
  contributions7d: number
  newUsers30d: number
  trafficSummaryAvailable: boolean
  topSites: { logo: string | null, name: string, visits: number }[]
  topSitesAvailable: boolean
  totalUsers: number
  userSummaryAvailable: boolean
  visits7d: number
  visitsToday: number
}

export interface AdminDashboardContentChannel {
  archived: number
  available: boolean
  draft: number
  href: string
  id: 'mcp' | 'prompts' | 'skills' | 'websites'
  label: string
  published: number
  total: number
}

export interface AdminDashboardData {
  audience: AdminDashboardAudience
  content: AdminDashboardContentChannel[]
  failedModules: string[]
  generatedAt: string
  reviews: AdminDashboardReviewQueue[]
  security: {
    active: number
    blocked: number
    failed: number
    issues: AdminDashboardIssue[]
    queued: number
    reviewRequired: number
    summaryAvailable: boolean
  } & RuntimeSummary
}

export interface AdminDashboardIssue {
  createdAt: string
  id: string
  name: string
  subjectType: string
  tone: 'danger' | 'warning'
  typeLabel: string
}

export interface AdminDashboardReviewQueue {
  available: boolean
  count: number
  description: string
  href: string
  id: 'mcp' | 'prompts' | 'skills' | 'websites'
  label: string
  securityPending?: number
}

interface CountRow {
  archived: string
  draft: string
  published: string
  total: string
}

type ModuleResult<T>
  = | { available: true, data: T, label: string }
    | { available: false, data: null, label: string }

interface ReportWindow {
  asOf: Date
  end: Date
  start7: Date
  start30: Date
  start60: Date
  start60Date: string
}

interface RuntimeSummary {
  available: boolean
  lastSeenAt: string | null
  serviceEnabled: boolean
  status: SecurityWorkerRuntime['status'] | 'unavailable'
  workerCount: number
}

const EMPTY_CONTENT_COUNTS: CountRow = { archived: '0', draft: '0', published: '0', total: '0' }
const EMPTY_RUNTIME: RuntimeSummary = {
  available: false,
  lastSeenAt: null,
  serviceEnabled: false,
  status: 'unavailable',
  workerCount: 0,
}
const EMPTY_SECURITY = {
  active: 0,
  blocked: 0,
  failed: 0,
  issues: [] as AdminDashboardIssue[],
  queued: 0,
  reviewRequired: 0,
}
const REVIEW_QUEUE_ORDER: AdminDashboardReviewQueue['id'][] = ['skills', 'mcp', 'prompts', 'websites']

export async function loadAdminDashboard(): Promise<AdminDashboardData> {
  await requireAdminSession()

  const asOf = new Date()
  const reportWindow = createReportWindow(asOf)
  const [
    skillsContent,
    mcpContent,
    promptContent,
    websiteContent,
    skillReviews,
    mcpReviews,
    promptReviews,
    websiteReviews,
    security,
    runtime,
    trafficSummary,
    visitSeries,
    communitySeries,
    topSites,
    userSummary,
    userSeries,
  ] = await Promise.all([
    loadContentCounts('Skills 内容', 'public.ds_skills'),
    loadContentCounts('MCP 内容', 'public.ds_mcps'),
    loadContentCounts('Prompts 内容', 'public.ds_prompts'),
    loadWebsiteCounts(),
    loadSubmissionCounts('Skill 投稿', 'public.ds_skill_submissions'),
    loadSubmissionCounts('MCP 投稿', 'public.ds_mcp_submissions'),
    loadPromptSubmissionCounts(),
    loadWebsiteSubmissionCounts(),
    loadSecuritySummary(),
    loadSecurityRuntime(),
    loadTrafficSummary(reportWindow),
    loadVisitSeries(reportWindow),
    loadCommunitySeries(reportWindow),
    loadTopSites(reportWindow),
    loadUserSummary(reportWindow),
    loadUserSeries(reportWindow),
  ])

  const results = [
    skillsContent,
    mcpContent,
    promptContent,
    websiteContent,
    skillReviews,
    mcpReviews,
    promptReviews,
    websiteReviews,
    security,
    runtime,
    trafficSummary,
    visitSeries,
    communitySeries,
    topSites,
    userSummary,
    userSeries,
  ]
  const traffic = trafficSummary.available ? trafficSummary.data : { activeSites7d: 0, visits7d: 0, visitsToday: 0 }
  const users = userSummary.available ? userSummary.data : { activeUsers7d: 0, newUsers30d: 0, totalUsers: 0 }
  const contributions = communitySeries.available
    ? communitySeries.data.slice(-7).reduce((total, point) => total + point.value, 0)
    : 0
  const securityData = security.available ? security.data : EMPTY_SECURITY
  const runtimeData = runtime.available ? runtime.data : EMPTY_RUNTIME

  return {
    audience: {
      ...traffic,
      ...users,
      analytics: {
        contributions: analyticsSeries(communitySeries, reportWindow),
        users: analyticsSeries(userSeries, reportWindow),
        visits: analyticsSeries(visitSeries, reportWindow),
      },
      contributions7d: contributions,
      trafficSummaryAvailable: trafficSummary.available,
      topSites: topSites.available ? topSites.data : [],
      topSitesAvailable: topSites.available,
      userSummaryAvailable: userSummary.available,
    },
    content: [
      contentChannel('skills', 'Skills', '/admin/skills/content', skillsContent),
      contentChannel('mcp', 'MCP', '/admin/mcp/content', mcpContent),
      contentChannel('prompts', 'Prompts', '/admin/prompts', promptContent),
      contentChannel('websites', '导航网站', '/admin/websites', websiteContent),
    ],
    failedModules: results.filter(result => !result.available).map(result => result.label),
    generatedAt: asOf.toISOString(),
    reviews: [
      reviewQueue('skills', 'Skill 投稿', '社区提交的能力包', '/admin/skills/submissions', skillReviews),
      reviewQueue('mcp', 'MCP 投稿', '社区提交的 MCP 服务', '/admin/mcp/submissions', mcpReviews),
      reviewQueue('prompts', 'Prompt 投稿', '已完成提交的社区内容', '/admin/prompts', promptReviews),
      reviewQueue('websites', '网站投稿', '等待收录的网站', '/admin/submissions', websiteReviews),
    ].sort(compareReviewQueues),
    security: { ...securityData, ...runtimeData, summaryAvailable: security.available },
  }
}

function analyticsSeries(result: ModuleResult<AdminAnalyticsPoint[]>, reportWindow: ReportWindow): AdminAnalyticsSeries {
  return result.available
    ? { available: true, points: fillDailySeries(result.data, reportWindow.start60Date, 60) }
    : { available: false, points: [] }
}

function compareReviewQueues(left: AdminDashboardReviewQueue, right: AdminDashboardReviewQueue) {
  if (left.available !== right.available)
    return left.available ? -1 : 1

  const leftHasSecurityWork = Number(left.securityPending ?? 0) > 0
  const rightHasSecurityWork = Number(right.securityPending ?? 0) > 0
  if (leftHasSecurityWork !== rightHasSecurityWork)
    return leftHasSecurityWork ? -1 : 1

  if (left.count !== right.count)
    return right.count - left.count

  return REVIEW_QUEUE_ORDER.indexOf(left.id) - REVIEW_QUEUE_ORDER.indexOf(right.id)
}

function contentChannel(
  id: AdminDashboardContentChannel['id'],
  label: string,
  href: string,
  result: ModuleResult<CountRow>,
): AdminDashboardContentChannel {
  const data = result.available ? result.data : EMPTY_CONTENT_COUNTS
  return {
    archived: integer(data.archived),
    available: result.available,
    draft: integer(data.draft),
    href,
    id,
    label,
    published: integer(data.published),
    total: integer(data.total),
  }
}

function createReportWindow(asOf: Date): ReportWindow {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(asOf)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const today = `${value('year')}-${value('month')}-${value('day')}`
  const start60Date = addDays(today, -60)
  const boundary = (date: string) => new Date(`${date}T00:00:00+08:00`)

  return {
    asOf,
    end: boundary(today),
    start7: boundary(addDays(today, -7)),
    start30: boundary(addDays(today, -30)),
    start60: boundary(start60Date),
    start60Date,
  }
}

function integer(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

async function loadCommunitySeries(reportWindow: ReportWindow) {
  return loadModule('社区贡献趋势', async () => {
    const result = await queryBusiness<{ date: string, value: string }>(`
      select to_char(activity_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as date, count(*)::text as value
      from (
        select created_at as activity_at from public.wonder_questions
          where visibility = 'visible' and created_at >= $1 and created_at < $2
        union all
        select created_at from public.wonder_answers
          where visibility = 'visible' and created_at >= $1 and created_at < $2
        union all
        select created_at from public.wonder_comments
          where visibility = 'visible' and created_at >= $1 and created_at < $2
        union all
        select published_at from public.wonder_works
          where visibility = 'visible' and published_at >= $1 and published_at < $2
      ) activity
      group by 1 order by 1
    `, [reportWindow.start60, reportWindow.end])
    return result.rows.map(point => ({ date: point.date, value: integer(point.value) }))
  })
}

async function loadContentCounts(label: string, table: string) {
  return loadModule(label, async () => {
    const result = await queryBusiness<CountRow>(`
      select count(*)::text as total,
             count(*) filter (where status = 'published')::text as published,
             count(*) filter (where status = 'draft')::text as draft,
             count(*) filter (where status = 'archived')::text as archived
      from ${table}
    `)
    return result.rows[0] ?? EMPTY_CONTENT_COUNTS
  })
}

async function loadModule<T>(label: string, loader: () => Promise<T>): Promise<ModuleResult<T>> {
  try {
    return { available: true, data: await loader(), label }
  }
  catch (error) {
    console.error('后台工作台模块加载失败', {
      code: databaseErrorCode(error),
      module: label,
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return { available: false, data: null, label }
  }
}

async function loadPromptSubmissionCounts() {
  return loadModule('Prompt 投稿', async () => {
    const result = await queryBusiness<{ pending: string }>(`
      select count(*)::text as pending from public.ds_prompts
      where submission_origin = 'community' and submitted_at is not null and status = 'draft'
    `)
    return result.rows[0] ?? { pending: '0' }
  })
}

async function loadSecurityRuntime() {
  return loadModule('评测执行节点', async () => {
    const runtime = await getSecurityWorkerRuntime()
    return {
      available: true,
      lastSeenAt: runtime.lastSeenAt,
      serviceEnabled: runtime.serviceEnabled,
      status: runtime.status,
      workerCount: runtime.workerCount,
    } satisfies RuntimeSummary
  })
}

async function loadSecuritySummary() {
  return loadModule('安全评测任务', async () => {
    const [counts, issues] = await Promise.all([
      queryBusiness<{ active: string, blocked: string, failed: string, queued: string, review_required: string }>(`
        select
          (select count(*) from public.ds_ai_security_assessments where status = 'queued')::text as queued,
          (select count(*) from public.ds_ai_security_assessments where status in ('preparing', 'running'))::text as active,
          (select count(*) from public.ds_ai_security_assessments where status = 'failed' and created_at >= now() - interval '7 days')::text as failed,
          (select count(*) from public.ds_ai_security_subject_states where report_state = 'blocked' and ignored_at is null)::text as blocked,
          (select count(*) from public.ds_ai_security_subject_states where report_state = 'review_required' and ignored_at is null)::text as review_required
      `),
      queryBusiness<{ created_at: Date, id: string, original_verdict: string | null, status: string, subject_name_snapshot: string, subject_type: string }>(`
        select id, subject_name_snapshot, subject_type, status, original_verdict, created_at
        from public.ds_ai_security_assessments
        where status = 'failed' or (status = 'completed' and original_verdict in ('blocked', 'review_required'))
        order by coalesce(finished_at, created_at) desc, id desc limit 5
      `),
    ])
    const totals = counts.rows[0]
    return {
      active: integer(totals?.active),
      blocked: integer(totals?.blocked),
      failed: integer(totals?.failed),
      issues: issues.rows.map(row => ({
        createdAt: row.created_at.toISOString(),
        id: row.id,
        name: row.subject_name_snapshot,
        subjectType: row.subject_type,
        tone: row.status === 'failed' || row.original_verdict === 'blocked' ? 'danger' as const : 'warning' as const,
        typeLabel: securityIssueLabel(row.status, row.original_verdict),
      })),
      queued: integer(totals?.queued),
      reviewRequired: integer(totals?.review_required),
    }
  })
}

async function loadSubmissionCounts(label: string, table: string) {
  return loadModule(label, async () => {
    const result = await queryBusiness<{ pending: string, security_pending: string }>(`
      select count(*) filter (where status in ('pending', 'pending_security'))::text as pending,
             count(*) filter (where status = 'pending_security')::text as security_pending
      from ${table}
    `)
    return result.rows[0] ?? { pending: '0', security_pending: '0' }
  })
}

async function loadTopSites(reportWindow: ReportWindow) {
  return loadModule('热门导航', async () => {
    const result = await queryBusiness<{ logo: string | null, name: string, visits: string }>(`
      select website.name, website.logo, count(*)::text as visits
      from public.ds_website_visit_events event
      join public.ds_websites website on website.id = event.website_id
      where event.created_at >= $1 and event.created_at < $2
      group by website.id, website.name, website.logo
      order by count(*) desc, website.name
      limit 5
    `, [reportWindow.start7, reportWindow.end])
    return result.rows.map(site => ({ logo: site.logo, name: site.name, visits: integer(site.visits) }))
  })
}

async function loadTrafficSummary(reportWindow: ReportWindow) {
  return loadModule('访问数据摘要', async () => {
    const result = await queryBusiness<{ activeSites7d: string, visits7d: string, visitsToday: string }>(`
      select
        count(*) filter (where created_at >= $3 and created_at < $4)::text as "visitsToday",
        count(*) filter (where created_at >= $1 and created_at < $2)::text as "visits7d",
        count(distinct website_id) filter (where created_at >= $1 and created_at < $2)::text as "activeSites7d"
      from public.ds_website_visit_events
    `, [reportWindow.start7, reportWindow.end, reportWindow.end, reportWindow.asOf])
    const row = result.rows[0]
    return {
      activeSites7d: integer(row?.activeSites7d),
      visits7d: integer(row?.visits7d),
      visitsToday: integer(row?.visitsToday),
    }
  })
}

async function loadUserSeries(reportWindow: ReportWindow) {
  return loadModule('用户增长趋势', async () => {
    const result = await getControlPool().query<{ date: string, value: string }>(`
      select to_char("createdAt" at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as date, count(*)::text as value
      from auth."user"
      where "createdAt" >= $1 and "createdAt" < $2
      group by 1 order by 1
    `, [reportWindow.start60, reportWindow.end])
    return result.rows.map(point => ({ date: point.date, value: integer(point.value) }))
  })
}

async function loadUserSummary(reportWindow: ReportWindow) {
  return loadModule('用户增长摘要', async () => {
    const result = await getControlPool().query<{ activeUsers7d: string, newUsers30d: string, totalUsers: string }>(`
      select
        count(*)::text as "totalUsers",
        count(*) filter (where "createdAt" >= $1 and "createdAt" < $2)::text as "newUsers30d",
        count(*) filter (where exists (
          select 1 from auth."session" session
          where session."userId" = users.id and session."updatedAt" >= $3 and session."updatedAt" < $4
        ))::text as "activeUsers7d"
      from auth."user" users
    `, [reportWindow.start30, reportWindow.end, reportWindow.start7, reportWindow.end])
    const row = result.rows[0]
    return {
      activeUsers7d: integer(row?.activeUsers7d),
      newUsers30d: integer(row?.newUsers30d),
      totalUsers: integer(row?.totalUsers),
    }
  })
}

async function loadVisitSeries(reportWindow: ReportWindow) {
  return loadModule('访问趋势', async () => {
    const result = await queryBusiness<{ date: string, value: string }>(`
      select to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as date, count(*)::text as value
      from public.ds_website_visit_events
      where created_at >= $1 and created_at < $2
      group by 1 order by 1
    `, [reportWindow.start60, reportWindow.end])
    return result.rows.map(point => ({ date: point.date, value: integer(point.value) }))
  })
}

async function loadWebsiteCounts() {
  return loadModule('导航网站内容', async () => {
    const result = await queryBusiness<{ total: string }>('select count(*)::text as total from public.ds_websites')
    const total = result.rows[0]?.total ?? '0'
    return { ...EMPTY_CONTENT_COUNTS, published: total, total }
  })
}

async function loadWebsiteSubmissionCounts() {
  return loadModule('网站投稿', async () => {
    const result = await queryBusiness<{ pending: string }>(`
      select count(*) filter (where status = 'pending')::text as pending from public.ds_website_submissions
    `)
    return result.rows[0] ?? { pending: '0' }
  })
}

function reviewQueue(
  id: AdminDashboardReviewQueue['id'],
  label: string,
  description: string,
  href: string,
  result: ModuleResult<{ pending: string, security_pending?: string }>,
): AdminDashboardReviewQueue {
  const data = result.available ? result.data : { pending: '0', security_pending: '0' }
  return {
    available: result.available,
    count: integer(data.pending),
    description,
    href,
    id,
    label,
    securityPending: integer(data.security_pending),
  }
}

function securityIssueLabel(status: string, verdict: string | null) {
  if (status === 'failed')
    return '当前依据待补充'
  if (verdict === 'blocked')
    return '存在阻断风险'
  return '建议核对'
}

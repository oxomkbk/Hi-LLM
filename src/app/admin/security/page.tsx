import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import {
  SECURITY_ASSESSMENT_STATUSES,
  SECURITY_REPORT_STATES,
  SECURITY_SUBJECT_TYPES,
} from '@/lib/ai-security/domain'
import { listAdminAssessments } from '@/lib/ai-security/service'
import { listAdminSecuritySubjects } from '@/lib/ai-security/subject-catalog'
import { requireAdminSession } from '@/lib/auth/session'

import SecurityConsole from '../components/security/security-console'

import type { SecurityAssessmentListData } from '../components/security/security-console'
import type { SecuritySubjectCatalogData, SecuritySubjectListFilters } from '../components/security/security-subject-catalog'
import type { SecurityAssessmentStatus, SecurityReportState, SecuritySubjectType } from '@/lib/ai-security/domain'

export const dynamic = 'force-dynamic'

export default async function AdminSecurityPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const session = await requireAdminSession()
  const capabilities = securityCapabilitiesForAdmin(session.user.id)
  const view = firstValue(query.view) === 'assessments' ? 'assessments' : 'subjects'
  const pageIndex = parsePageIndex(firstValue(query.page))
  const q = firstValue(query.q)?.slice(0, 100) ?? ''
  const subjectType = enumParam<SecuritySubjectType>(firstValue(query.type), SECURITY_SUBJECT_TYPES) ?? 'all'
  const assessmentStatus = enumParam<SecurityAssessmentStatus>(firstValue(query.status), SECURITY_ASSESSMENT_STATUSES) ?? 'all'
  const reportState = enumParam<SecurityReportState>(firstValue(query.reportState), SECURITY_REPORT_STATES) ?? 'all'
  const contentStatus = enumParam(firstValue(query.contentStatus), ['published', 'draft', 'pending', 'pending_security', 'archived', 'rejected'] as const) ?? 'all'
  const scope = firstValue(query.scope) === 'ignored' ? 'ignored' : 'active'
  const assessmentFilters = {
    pageIndex: view === 'assessments' ? pageIndex : 0,
    q: view === 'assessments' ? q : '',
    status: view === 'assessments' ? assessmentStatus : 'all',
    subjectType: view === 'assessments' ? subjectType : 'all',
  } as const
  const subjectFilters: SecuritySubjectListFilters = {
    contentStatus: view === 'subjects' ? contentStatus : 'all',
    pageIndex: view === 'subjects' ? pageIndex : 0,
    q: view === 'subjects' ? q : '',
    reportState: view === 'subjects' ? reportState : 'all',
    scope: view === 'subjects' ? scope : 'active',
    subjectType: view === 'subjects' ? subjectType : 'all',
  }
  const [initialData, initialSubjects] = await Promise.all([
    listAdminAssessments({
      pageIndex: assessmentFilters.pageIndex,
      pageSize: 20,
      q: assessmentFilters.q || undefined,
      status: assessmentFilters.status === 'all' ? undefined : assessmentFilters.status,
      subjectType: assessmentFilters.subjectType === 'all' ? undefined : assessmentFilters.subjectType,
    }),
    listAdminSecuritySubjects({
      contentStatus: subjectFilters.contentStatus === 'all' ? undefined : subjectFilters.contentStatus,
      ignored: subjectFilters.scope === 'ignored',
      pageIndex: subjectFilters.pageIndex,
      pageSize: 20,
      q: subjectFilters.q || undefined,
      reportState: subjectFilters.reportState === 'all' ? undefined : subjectFilters.reportState as SecurityReportState,
      subjectType: subjectFilters.subjectType === 'all' ? undefined : subjectFilters.subjectType as SecuritySubjectType,
    }, capabilities),
  ])
  return (
    <SecurityConsole
      initialAssessmentFilters={assessmentFilters}
      initialData={initialData as unknown as SecurityAssessmentListData}
      initialSubjectFilters={subjectFilters}
      initialSubjects={initialSubjects as SecuritySubjectCatalogData}
      initialView={view}
    />
  )
}

function enumParam<T extends string>(value: string | undefined, allowed: readonly T[]) {
  return value && allowed.includes(value as T) ? value as T : undefined
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePageIndex(value?: string) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page - 1 : 0
}

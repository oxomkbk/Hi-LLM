import { notFound } from 'next/navigation'

import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { getAdminAssessmentDetail, SecurityAssessmentServiceError } from '@/lib/ai-security/service'
import { requireAdminSession } from '@/lib/auth/session'
import { safeReturnTo } from '@/lib/navigation/return-context'
import { isUuid } from '@/lib/security'

import AssessmentReport from '../../components/security/assessment-report'

import type { AssessmentDetailData } from '../../components/security/assessment-report'

export const dynamic = 'force-dynamic'

export default async function AdminSecurityReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  if (!isUuid(id))
    notFound()
  const [session, data] = await Promise.all([
    requireAdminSession(),
    getAdminAssessmentDetail(id).catch((error: unknown) => {
      if (error instanceof SecurityAssessmentServiceError && error.status === 404)
        return null
      throw error
    }),
  ])
  if (!data)
    notFound()
  return (
    <AssessmentReport
      data={{
        ...data,
        capabilities: securityCapabilitiesForAdmin(session.user.id),
      } as unknown as AssessmentDetailData}
      returnHref={safeAdminReturnHref(query.returnTo)}
    />
  )
}

function safeAdminReturnHref(value: string | string[] | undefined) {
  const candidate = safeReturnTo(value, '', {
    exactPathnames: ['/admin/security'],
    pathnamePrefixes: ['/admin/mcp/submissions', '/admin/skills/submissions'],
  })
  if (!candidate)
    return null
  const pathname = new URL(candidate, 'https://hillm-nav.local').pathname
  if (pathname !== '/admin/security' && !/^\/admin\/(?:skills|mcp)\/submissions\/[0-9a-f-]+\/review$/i.test(pathname))
    return null
  return candidate
}

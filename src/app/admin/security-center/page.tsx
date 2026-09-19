import { requireAdminSession } from '@/lib/auth/session'
import { getSiteSecurityCenterState } from '@/lib/site-security-center/service'

import SiteSecurityCenter from '../components/security/site-security-center'

export const dynamic = 'force-dynamic'

export default async function AdminSiteSecurityCenterPage() {
  const session = await requireAdminSession()
  const initialData = await getSiteSecurityCenterState(session.user.id)

  return <SiteSecurityCenter initialData={initialData} />
}

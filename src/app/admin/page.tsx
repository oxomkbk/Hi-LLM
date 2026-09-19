import AdminDashboard from './dashboard/admin-dashboard'
import { loadAdminDashboard } from './dashboard/dashboard-data'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  return <AdminDashboard data={await loadAdminDashboard()} />
}

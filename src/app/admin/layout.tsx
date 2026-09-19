import './admin-theme.css'

import { redirect } from 'next/navigation'

import { requireAdminSession } from '@/lib/auth/session'

import AdminShell from './components/admin-shell'

import type { AdminAccountUser } from './components/admin-account-menu'

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdminSession().catch(() => null)

  if (!session)
    redirect('/login')

  const account: AdminAccountUser = {
    avatarUrl: session.user.image ?? null,
    email: session.user.email,
    name: session.user.name || session.user.email.split('@')[0] || '管理员',
  }

  return <AdminShell user={account}>{children}</AdminShell>
}

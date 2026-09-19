import { getPrivateAccount } from '@/lib/account/service'
import { requireUserSession } from '@/lib/auth/session'

import AccountCenter from './account-center'
import { normalizeAccountSection } from './account-sections'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  description: '管理个人资料、头像、账号安全与妙妙屋社区权限。',
  title: `个人中心 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
}

interface AccountPageProps {
  searchParams: Promise<{ section?: string | string[] }>
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const session = await requireUserSession()
  const [account, query] = await Promise.all([
    getPrivateAccount(session.user.id),
    searchParams,
  ])
  return <AccountCenter data={account} section={normalizeAccountSection(query.section)} />
}

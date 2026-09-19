import Link from 'next/link'
import { redirect } from 'next/navigation'

import SubmissionUnavailable from '@/components/submission/submission-unavailable'
import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'
import { listPublicQuestionCategories } from '@/lib/wonderland/repositories/community'

import WonderlandQuestionForm from './question-form'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: `发布问题・妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}` }
export const dynamic = 'force-dynamic'

export default async function WonderlandAskPage() {
  const [session, accessSettings] = await Promise.all([
    getServerSession().catch(() => null),
    getPublicSiteAccessSettings(),
  ])
  const authenticated = session?.user.status === 'active'
  if (!accessSettings.wonderlandSubmissionEnabled)
    return <SubmissionUnavailable backHref="/wonderland" backLabel="返回妙妙屋" channelLabel="妙妙屋" />
  if (!authenticated && accessSettings.wonderlandComposerMode === 'authenticated')
    redirect(createLoginUrl('/wonderland/ask'))
  const categories = await listPublicQuestionCategories()
  const canAsk = !authenticated || session.user.role === 'admin' || session.user.canAsk

  if (canAsk)
    return <WonderlandQuestionForm authenticated={authenticated} categories={categories} />

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="wonderland-login-prompt">
        <div>
          <strong>当前账号不能发布问题</strong>
          <span>该权限由管理员配置，你仍然可以浏览已有讨论。</span>
        </div>
        <Link href="/account">查看账号权限</Link>
      </div>
    </main>
  )
}

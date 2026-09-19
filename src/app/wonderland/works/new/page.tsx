import Link from 'next/link'
import { redirect } from 'next/navigation'

import SubmissionUnavailable from '@/components/submission/submission-unavailable'
import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'

import WonderlandWorkForm from './work-form'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: `发布作品・妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}` }
export const dynamic = 'force-dynamic'

export default async function WonderlandNewWorkPage() {
  const [settings, session] = await Promise.all([
    getPublicSiteAccessSettings(),
    getServerSession().catch(() => null),
  ])
  if (!settings.workSubmissionEnabled)
    return <SubmissionUnavailable backHref="/wonderland/works" backLabel="返回作品广场" channelLabel="作品" />
  if (!session || session.user.status !== 'active')
    redirect(createLoginUrl('/wonderland/works/new'))
  const canPublish = session.user.role === 'admin' || (session.user.canPublishWorks && session.user.canUpload)

  if (canPublish)
    return <WonderlandWorkForm />

  return (
    <main className="grid min-h-[70vh] place-items-center px-6">
      <div className="wonderland-login-prompt">
        <div>
          <strong>当前账号不能发布作品</strong>
          <span>发布作品需要作品发布与图片上传权限；你仍然可以浏览作品广场。</span>
        </div>
        <Link href="/account">查看账号权限</Link>
      </div>
    </main>
  )
}

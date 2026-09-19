import { redirect } from 'next/navigation'

import SkillSubmissionForm from '@/components/SkillSubmissionForm'
import SubmissionUnavailable from '@/components/submission/submission-unavailable'
import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `投稿 Skill | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '向 Skills 社区提交公开、可复用的 AI Skill。',
}
export const dynamic = 'force-dynamic'

export default async function SubmitSkillPage() {
  const [settings, session] = await Promise.all([
    getPublicSiteAccessSettings(),
    getServerSession().catch(() => null),
  ])
  if (!settings.skillSubmissionEnabled)
    return <SubmissionUnavailable backHref="/skills" backLabel="返回 Skills" channelLabel="Skills" />
  if (settings.skillSubmissionMode === 'authenticated' && session?.user.status !== 'active')
    redirect(createLoginUrl('/skills/submit'))
  return <SkillSubmissionForm />
}

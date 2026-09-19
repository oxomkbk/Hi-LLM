import { redirect } from 'next/navigation'

import PromptSubmissionForm from '@/components/PromptSubmissionForm'
import SubmissionUnavailable from '@/components/submission/submission-unavailable'
import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'
import { promptRepository } from '@/lib/repositories/prompts'

import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `投稿 Prompt | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '提交提示词、Markdown 说明、样式文件、图片、视频或完整资源包。',
}

export default async function SubmitPromptPage() {
  const [settings, session] = await Promise.all([
    getPublicSiteAccessSettings(),
    getServerSession().catch(() => null),
  ])
  if (!settings.promptSubmissionEnabled)
    return <SubmissionUnavailable backHref="/prompts" backLabel="返回 Prompts" channelLabel="Prompt" />
  if (session?.user.status !== 'active')
    redirect(createLoginUrl('/prompts/submit'))
  const categories = await promptRepository.listCategories({ activeOnly: true })
  return <PromptSubmissionForm categories={categories} userId={session.user.id} />
}

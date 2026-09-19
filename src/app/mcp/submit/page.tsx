import { redirect } from 'next/navigation'

import McpSubmissionForm from '@/components/McpSubmissionForm'
import SubmissionUnavailable from '@/components/submission/submission-unavailable'
import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: `提交 MCP Server | ${process.env.NEXT_PUBLIC_APP_NAME}`, description: '向 MCP Directory 提交公开、可审查的 MCP Server。' }
export const dynamic = 'force-dynamic'
export default async function SubmitMcpPage() {
  const [settings, session] = await Promise.all([
    getPublicSiteAccessSettings(),
    getServerSession().catch(() => null),
  ])
  if (!settings.mcpSubmissionEnabled)
    return <SubmissionUnavailable backHref="/mcp" backLabel="返回 MCP" channelLabel="MCP" />
  if (settings.mcpSubmissionMode === 'authenticated' && session?.user.status !== 'active')
    redirect(createLoginUrl('/mcp/submit'))
  return <McpSubmissionForm />
}

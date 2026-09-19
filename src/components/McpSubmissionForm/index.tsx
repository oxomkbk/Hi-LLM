'use client'

import { ArrowRight, CircleCheckFill } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import Link from 'next/link'
import { useState } from 'react'

import McpComposer from '@/components/mcp-composer/mcp-composer'
import { createEmptyMcpComposerValue, mcpComposerPayload } from '@/components/mcp-composer/types'
import { createLoginUrl } from '@/lib/auth/callback-url'

import type { McpComposerValue, McpSubmitIntent } from '@/components/mcp-composer/types'
import type { IResponse } from '@/types'

const DRAFT_KEY = 'hillm-nav:mcp-composer:v1:submission:current:new'

export default function McpSubmissionForm() {
  const [formStartedAt] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const submit = async (value: McpComposerValue, intent: McpSubmitIntent) => {
    if (intent !== 'submit')
      return false
    setSubmitting(true)
    setError(null)
    try {
      const payload = { ...mcpComposerPayload(value), company: '', form_started_at: formStartedAt }
      const response = await fetch('/api/mcp-submissions', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as IResponse<unknown>
      if (response.status === 401 && result.error?.code === 'AUTH_REQUIRED') {
        persistImmediateDraft(value)
        window.location.assign(createLoginUrl('/mcp/submit'))
        return false
      }
      if (!response.ok || result.code !== 200)
        throw new Error(result.msg || '投稿失败，请稍后再试')
      setSubmitted(true)
      return true
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '投稿失败，请稍后再试')
      return false
    }
    finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="submission-success-page skill-submit-full-bleed grid min-h-[calc(100svh-4rem)] place-items-center px-4 py-12">
        <section className="submission-success-card w-full max-w-xl px-6 py-10 text-center sm:px-10">
          <span className="submission-success-icon mx-auto grid size-14 place-items-center"><CircleCheckFill className="size-7" /></span>
          <h1 className="mt-6 text-2xl font-black tracking-[-0.035em]">MCP 投稿已提交</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">来源和连接配置已保存，后台会继续完成必要检查。发布时仍只会生成一条正式 MCP 内容。</p>
          <div className="submission-success-actions mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="secondary" onPress={() => window.location.reload()}>继续投稿</Button>
            <Link href="/mcp" className="submission-success-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold transition-opacity hover:opacity-90">
              返回 MCP 目录
              <ArrowRight />
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <McpComposer
      title="提交 MCP Server"
      isSubmitting={submitting}
      backHref="/mcp"
      draftKey={DRAFT_KEY}
      error={error}
      initialValue={createEmptyMcpComposerValue()}
      mode="submission"
      onSubmit={submit}
    />
  )
}

function persistImmediateDraft(value: McpComposerValue) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
      baseUpdatedAt: null,
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1_000,
      savedAt: Date.now(),
      value,
      version: 1,
    }))
  }
  catch {
    // Navigation remains available when browser storage is disabled.
  }
}

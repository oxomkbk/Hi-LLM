'use client'

import { Alert, Button, Spinner, toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import McpComposer from '@/components/mcp-composer/mcp-composer'
import { createEmptyMcpComposerValue, mcpComposerPayload, mcpToComposerValue } from '@/components/mcp-composer/types'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'

import type { McpComposerValue, McpSubmitIntent } from '@/components/mcp-composer/types'
import type { Mcp } from '@/types'

export default function AdminMcpComposerPage({ mcpId, returnHref = '/admin/mcp/content' }: { mcpId?: string, returnHref?: string }) {
  const router = useRouter()
  const [mcp, setMcp] = useState<Mcp | null>(null)
  const [loading, setLoading] = useState(Boolean(mcpId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!mcpId)
      return
    let active = true
    request<Mcp>(`/mcps/${mcpId}`)
      .then((result) => {
        if (active)
          setMcp(result.data)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'MCP 加载失败')
      })
      .finally(() => {
        if (active)
          setLoading(false)
      })
    return () => {
      active = false
    }
  }, [mcpId])

  const submit = async (value: McpComposerValue, intent: McpSubmitIntent) => {
    if (intent !== 'save')
      return false
    setSubmitting(true)
    setError(null)
    try {
      const payload = { ...mcpComposerPayload(value), expected_updated_at: mcp?.updated_at }
      const result = await request<Mcp>(mcpId ? `/mcps/${mcpId}` : '/mcps', {
        body: JSON.stringify(payload),
        method: mcpId ? 'PUT' : 'POST',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return false
      toast.success(result.msg || (mcpId ? 'MCP 已更新' : 'MCP 已发布'))
      if (!mcpId) {
        router.replace(buildContextualHref(`/admin/mcp/${result.data.id}/edit`, returnHref))
      }
      else {
        setMcp(result.data)
        setVersion(current => current + 1)
      }
      return true
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试')
      return false
    }
    finally {
      setSubmitting(false)
    }
  }

  if (loading)
    return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>

  if (mcpId && !mcp) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>无法打开 MCP</Alert.Title>
          <Alert.Description>{error ?? '内容不存在或已被删除。'}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={() => router.push(returnHref)}>返回列表</Button>
      </Alert>
    )
  }

  return (
    <McpComposer
      key={`${mcpId ?? 'new'}-${version}`}
      title={mcpId ? `编辑 ${mcp?.name ?? 'MCP Server'}` : '新增 MCP Server'}
      isSubmitting={submitting}
      backHref={returnHref}
      baseUpdatedAt={mcp?.updated_at}
      draftKey={`hillm-nav:mcp-composer:v1:${mcpId ? 'admin-edit' : 'admin-create'}:current:${mcpId ?? 'new'}`}
      draftStorage={mcpId ? 'session' : 'local'}
      error={error}
      initialValue={mcp ? mcpToComposerValue(mcp) : createEmptyMcpComposerValue()}
      mode={mcpId ? 'admin-edit' : 'admin-create'}
      onSubmit={submit}
    />
  )
}

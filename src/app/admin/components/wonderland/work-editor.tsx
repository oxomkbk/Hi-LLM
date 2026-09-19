'use client'

import { Alert, Button, Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'

import { request } from '@/lib/request'

import WonderlandWorkForm from '../../../wonderland/works/new/work-form'

import type { WonderlandWorkDraft } from '../../../wonderland/works/new/work-form'

export default function WonderlandWorkEditor({ workId, returnHref = '/admin/wonderland/works' }: {
  returnHref?: string
  workId: string
}) {
  const [work, setWork] = useState<WonderlandWorkDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void request<WonderlandWorkDraft>(`/admin/wonderland/works/${workId}`).then((result) => {
      if (active)
        setWork(result.data)
    }).catch((cause: unknown) => {
      if (active)
        setError(cause instanceof Error ? cause.message : '作品资料加载失败')
    })
    return () => {
      active = false
    }
  }, [workId])

  if (error) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Alert status="danger" className="max-w-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>无法打开作品编辑器</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
          <Button size="sm" onPress={() => window.location.reload()}>重新加载</Button>
        </Alert>
      </div>
    )
  }

  if (!work)
    return <div className="grid min-h-[55vh] place-items-center"><Spinner /></div>

  return <WonderlandWorkForm initial={work} mode="edit" returnHref={returnHref} />
}

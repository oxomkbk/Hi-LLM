'use client'

import { Flag } from '@gravity-ui/icons'
import { Button, Modal, TextArea, toast, useOverlayState } from '@heroui/react'
import Link from 'next/link'
import { useState } from 'react'

import { useAuthUser } from '@/hooks/use-auth-user'
import { request } from '@/lib/request'

import type { FormEvent } from 'react'

const REASONS = [
  ['spam', '广告或垃圾内容'],
  ['abuse', '辱骂或人身攻击'],
  ['misinformation', '错误或误导信息'],
  ['privacy', '泄露隐私'],
  ['illegal', '疑似违法内容'],
  ['other', '其他问题'],
] as const

export default function ReportButton({ returnPath, targetId, targetType }: {
  returnPath: string
  targetId: string
  targetType: 'answer' | 'comment' | 'question'
}) {
  const modal = useOverlayState()
  const { loading, user } = useAuthUser()
  const [submitting, setSubmitting] = useState(false)
  const targetLabel = { answer: '回答', comment: '评论', question: '问题' }[targetType]

  if (loading)
    return null
  if (!user) {
    return (
      <Link href={`/login?callbackURL=${encodeURIComponent(returnPath)}`} className="wonderland-report-trigger">
        <Flag />
        举报
      </Link>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    try {
      await request('/wonderland/reports', {
        body: JSON.stringify({
          [`${targetType}Id`]: targetId,
          details: String(form.get('details') || ''),
          reason: String(form.get('reason') || 'other'),
        }),
        method: 'POST',
      })
      toast.success('举报已提交，管理员会尽快处理')
      modal.close()
    }
    catch {
      // request 统一展示错误。
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button type="button" onClick={modal.open} className="wonderland-report-trigger">
        <Flag />
        举报
      </button>
      <Modal.Backdrop isOpen={modal.isOpen} onOpenChange={modal.setOpen}>
        <Modal.Container placement="center">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                举报
                {targetLabel}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form id={`wonder-report-${targetType}-${targetId}`} onSubmit={submit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span>举报原因</span>
                  <select name="reason" defaultValue="spam" required className="h-10 rounded-lg border border-border bg-surface px-3">
                    {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <TextArea
                  aria-label="补充说明"
                  name="details"
                  variant="secondary"
                  maxLength={1000}
                  placeholder="可选：说明具体位置和问题，便于管理员核查。"
                  rows={4}
                />
              </form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close">取消</Button>
              <Button type="submit" isDisabled={submitting} isPending={submitting} form={`wonder-report-${targetType}-${targetId}`}>提交举报</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

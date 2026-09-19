'use client'

import {
  Button,
  FieldError,
  Label,
  Modal,
  Spinner,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import { useState } from 'react'

import useRequest from '@/hooks/use-request'
import { RESPONSE } from '@/lib/utils'

import type { WebsiteSubmission } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'

interface ReviewDialogProps {
  state: UseOverlayStateReturn
  submission: WebsiteSubmission | null
  action: 'approve' | 'reject'
  onReviewed: VoidFunction
}

export default function ReviewDialog({ state, submission, action, onReviewed }: ReviewDialogProps) {
  const [note, setNote] = useState(() => submission?.review_note ?? '')
  const isApprove = action === 'approve'

  const { loading, run } = useRequest('/submissions/:id/review', {
    method: 'POST',
    manual: true,
    onSuccess: ({ code, msg }) => {
      if (code === RESPONSE.SUCCESS) {
        toast.success(msg)
        state.close()
        onReviewed()
      }
    },
  })

  const confirm = async () => {
    if (submission)
      await run(submission.id, { action, note }).catch(() => {})
  }

  return (
    <Modal.Backdrop isDismissable={!loading} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container placement="auto">
        <Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger aria-label="关闭审核窗口" onPress={state.close} />
          <Modal.Header>
            <Modal.Icon className={isApprove ? 'bg-success-soft text-success-soft-foreground' : 'bg-danger-soft text-danger-soft-foreground'}>
              {isApprove ? '✓' : '×'}
            </Modal.Icon>
            <Modal.Heading>{isApprove ? '确认通过该投稿？' : '拒绝该投稿'}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {isApprove
              ? (
                  <p className="text-sm leading-6 text-muted">
                    “
                    {submission?.name}
                    ” 将立即写入网站列表并出现在首页。发布后如需调整，请前往“网站列表”继续编辑。
                  </p>
                )
              : (
                  <TextField maxLength={300} value={note} onChange={setNote}>
                    <Label>审核备注（可选）</Label>
                    <TextArea variant="secondary" placeholder="记录拒绝原因，便于后台追踪" rows={4} />
                    <FieldError />
                  </TextField>
                )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" isDisabled={loading} slot="close" onPress={state.close}>取消</Button>
            <Button variant={isApprove ? 'primary' : 'danger'} isPending={loading} onPress={confirm}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? '处理中...' : isApprove ? '确认发布' : '确认拒绝'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

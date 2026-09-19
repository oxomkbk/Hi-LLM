'use client'
import { AlertDialog, Button, Spinner } from '@heroui/react'
import { useEffect, useRef } from 'react'

import type { UseOverlayStateReturn } from '@heroui/react'
import type { FC } from 'react'

interface DeleteDialogProps {
  state: UseOverlayStateReturn
  loading: boolean
  handleDelConfirm: VoidFunction
  onClose?: VoidFunction
}

const DeleteDialog: FC<DeleteDialogProps> = ({ state, loading = false, handleDelConfirm, onClose }) => {
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (wasOpenRef.current && !state.isOpen) {
      onClose?.()
    }
    wasOpenRef.current = state.isOpen
  }, [state.isOpen, onClose])
  return (
    <AlertDialog.Backdrop isDismissable={!loading} isKeyboardDismissDisabled={loading} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-100">
          <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={state.close} />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>确认删除该网站？</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>删除后无法恢复，网站 Logo 文件也会一并删除。</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" isDisabled={loading} slot="close" onPress={state.close}>取消</Button>
            <Button variant="danger" isPending={loading} onPress={handleDelConfirm}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? '正在删除...' : '确认删除'}
                </>
              )}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
export default DeleteDialog

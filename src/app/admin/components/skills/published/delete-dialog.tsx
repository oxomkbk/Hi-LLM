'use client'

import { AlertDialog, Button, Spinner } from '@heroui/react'

import type { Skill } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'

interface SkillDeleteDialogProps {
  state: UseOverlayStateReturn
  skill: Skill | null
  loading: boolean
  onConfirm: VoidFunction
}

export default function SkillDeleteDialog({ state, skill, loading, onConfirm }: SkillDeleteDialogProps) {
  return (
    <AlertDialog.Backdrop isDismissable={!loading} isKeyboardDismissDisabled={loading} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container className="overscroll-contain">
        <AlertDialog.Dialog className="sm:max-w-md">
          <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={state.close} />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>确认删除该 Skill？</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="leading-6">
              “
              <strong>{skill?.name}</strong>
              ” 将从社区中永久移除，且无法恢复。若只是暂时下线，建议改为“已归档”。
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" isDisabled={loading} slot="close" onPress={state.close}>取消</Button>
            <Button variant="danger" isPending={loading} onPress={onConfirm}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? '删除中…' : '永久删除'}
                </>
              )}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}

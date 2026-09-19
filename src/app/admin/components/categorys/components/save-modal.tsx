'use client'
import { CircleCheckFill } from '@gravity-ui/icons'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  NumberField,
  Spinner,
  TextField,
  toast,
} from '@heroui/react'
import { useEffect, useRef } from 'react'

import useRequest from '@/hooks/use-request'
import { RESPONSE } from '@/lib/utils'

import type { Category, CategorySaveParams } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { FC, FormEvent } from 'react'

interface SaveModalProps {
  state: UseOverlayStateReturn
  initialValues: Category | null
  handleRefresh: VoidFunction
  onClose?: VoidFunction
}

const SaveModal: FC<SaveModalProps> = ({ state, initialValues, handleRefresh, onClose }) => {
  // 表单实例
  const formRef = useRef<HTMLFormElement>(null)
  const wasOpenRef = useRef(false)
  const isEdit = !!initialValues?.id
  const actionText = isEdit ? '编辑' : '新增'

  useEffect(() => {
    if (wasOpenRef.current && !state.isOpen) {
      formRef?.current?.reset()
      onClose?.()
    }
    wasOpenRef.current = state.isOpen
  }, [state.isOpen, onClose])

  // 保存表单
  const { loading, run } = useRequest('/categorys', {
    method: isEdit ? 'PUT' : 'POST',
    manual: true,
    onSuccess: ({ code }) => {
      if (code === RESPONSE.SUCCESS) {
        state.close()
        toast.success('提交成功', {
          timeout: 2000,
          indicator: <CircleCheckFill />,
        })
        handleRefresh?.()
      }
    },
  })

  // 表单提交
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data: CategorySaveParams = {
      name: formData.get('name') as string,
      sort: Number(formData.get('sort')),
    }
    await (initialValues?.id ? run(initialValues.id, data) : run(data)).catch(() => {})
  }
  return (
    <Modal.Backdrop
      variant="blur"
      isDismissable={!loading}
      isKeyboardDismissDisabled={loading}
      isOpen={state.isOpen}
      onOpenChange={state.setOpen}
    >
      <Modal.Container size="sm" placement="center" scroll="inside">
        <Modal.Dialog className="overflow-hidden">
          <Modal.CloseTrigger aria-label="关闭分类编辑器" onPress={state.close} />
          <Modal.Header className="border-b border-border">
            <Modal.Heading>{`${actionText}分类`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-5">
            <Form key={initialValues?.id ?? 'create'} ref={formRef} id="category-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <TextField
                name="name"
                isRequired
                defaultValue={initialValues?.name ?? ''}
                maxLength={100}
                minLength={1}
                validate={(value) => {
                  if (!value) {
                    return '请输入分类名称'
                  }
                  return null
                }}
              >
                <Label>分类名称</Label>
                <Input aria-label="Name" variant="secondary" fullWidth placeholder="请输入分类名称" />
                <FieldError />
              </TextField>
              <NumberField
                name="sort"
                variant="secondary"
                isRequired
                defaultValue={initialValues?.sort ?? 1}
                maxValue={99}
                minValue={1}
                validate={(value) => {
                  if (!value) {
                    return '请输入排序'
                  }
                  return null
                }}
              >
                <Label>排序</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            </Form>
          </Modal.Body>
          <Modal.Footer className="border-t border-border">
            <Button variant="outline" isDisabled={loading} slot="close" onPress={state.close}>
              取消
            </Button>
            <Button type="submit" isPending={loading} form="category-form">
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? '正在提交...' : '确定'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
export default SaveModal

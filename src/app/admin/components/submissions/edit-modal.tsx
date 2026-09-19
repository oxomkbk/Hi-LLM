'use client'

import { Check, Xmark } from '@gravity-ui/icons'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  NumberField,
  Spinner,
  Switch,
  SwitchGroup,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import Image from 'next/image'
import { useState } from 'react'

import CategoryMultiSelect from '@/components/ui/category-multi-select'
import TagInputs from '@/components/ui/tag-inputs'
import useRequest from '@/hooks/use-request'
import { generateLogoUrl, RESPONSE } from '@/lib/utils'

import type { CategoryOption, WebsiteSubmission } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { FormEvent } from 'react'

interface EditModalProps {
  state: UseOverlayStateReturn
  submission: WebsiteSubmission | null
  categories: CategoryOption[]
  onSaved: VoidFunction
}

const SWITCH_OPTIONS = [
  { name: 'pinned', label: '置顶' },
  { name: 'vpn', label: 'VPN' },
  { name: 'recommend', label: '推荐' },
  { name: 'commonlyUsed', label: '常用' },
] as const

export default function SubmissionEditModal({ state, submission, categories, onSaved }: EditModalProps) {
  const [tags, setTags] = useState<string[]>(() => submission?.tags ?? [])
  const [categoryIds, setCategoryIds] = useState<string[]>(() =>
    submission?.category_ids?.length
      ? submission.category_ids
      : submission?.category_id
        ? [submission.category_id]
        : [],
  )

  const { loading, run } = useRequest('/submissions', {
    method: 'PUT',
    manual: true,
    onSuccess: ({ code, msg }) => {
      if (code === RESPONSE.SUCCESS) {
        toast.success(msg)
        state.close()
        onSaved()
      }
    },
  })

  if (!submission)
    return null

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    if (!categoryIds.length) {
      toast.danger('请至少选择一个分类')
      return
    }

    await run(submission.id, {
      category_id: categoryIds[0]!,
      category_ids: categoryIds,
      name: formData.get('name') as string,
      url: formData.get('url') as string,
      desc: formData.get('desc') as string,
      tags,
      sort: Number(formData.get('sort')),
      pinned: formData.has('pinned'),
      vpn: formData.has('vpn'),
      recommend: formData.has('recommend'),
      commonlyUsed: formData.has('commonlyUsed'),
    }).catch(() => {})
  }

  return (
    <Modal.Backdrop variant="blur" isDismissable={!loading} isKeyboardDismissDisabled={loading} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container size="lg" placement="center" scroll="inside">
        <Modal.Dialog className="overflow-hidden sm:max-w-3xl">
          <Modal.CloseTrigger aria-label="关闭投稿编辑器" onPress={state.close} />
          <Modal.Header className="border-b border-border">
            <Modal.Heading>编辑网站投稿</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-5">
            <Form id="submission-edit-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <CategoryMultiSelect
                categories={categories}
                disabled={loading}
                value={categoryIds}
                onChange={setCategoryIds}
              />

              <TextField name="name" isRequired defaultValue={submission.name} maxLength={100}>
                <Label>网站名称</Label>
                <Input variant="secondary" fullWidth />
                <FieldError />
              </TextField>

              <TextField
                name="url"
                isRequired
                defaultValue={submission.url}
                validate={(value) => {
                  try {
                    const url = new URL(value)
                    return url.protocol === 'https:' ? null : '网站链接必须使用 HTTPS'
                  }
                  catch {
                    return '请输入合法的网站链接'
                  }
                }}
              >
                <Label>网站链接</Label>
                <Input type="url" variant="secondary" fullWidth />
                <FieldError />
              </TextField>

              {submission.logo
                ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-secondary p-3">
                      <div className="relative size-12 overflow-hidden rounded-xl bg-white">
                        <Image alt={submission.name} fill src={generateLogoUrl(submission.logo)} className="object-contain p-1" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">投稿 Logo</p>
                        <p className="mt-0.5 text-[11px] text-muted">通过后可在网站列表中重新上传</p>
                      </div>
                    </div>
                  )
                : null}

              <TagInputs value={tags} onChange={nextTags => setTags(nextTags.slice(0, 8))} />

              <TextField name="desc" defaultValue={submission.desc ?? ''} maxLength={500}>
                <Label>网站描述</Label>
                <TextArea variant="secondary" fullWidth rows={3} />
              </TextField>

              <div className="flex flex-col gap-1">
                <Label>网站属性</Label>
                <SwitchGroup orientation="horizontal" className="flex-wrap">
                  {SWITCH_OPTIONS.map(option => (
                    <Switch key={option.name} name={option.name} defaultSelected={Boolean(submission[option.name])} value="on">
                      {({ isSelected }) => (
                        <Switch.Content>
                          <Switch.Control>
                            <Switch.Thumb>
                              <Switch.Icon>{isSelected ? <Check className="size-3" /> : <Xmark className="size-3 opacity-70" />}</Switch.Icon>
                            </Switch.Thumb>
                          </Switch.Control>
                          {option.label}
                        </Switch.Content>
                      )}
                    </Switch>
                  ))}
                </SwitchGroup>
              </div>

              <NumberField
                name="sort"
                variant="secondary"
                isRequired
                defaultValue={submission.sort || 1}
                maxValue={99}
                minValue={1}
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
            <Button variant="outline" isDisabled={loading} slot="close" onPress={state.close}>取消</Button>
            <Button type="submit" isPending={loading} form="submission-edit-form">
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? '保存中...' : '保存修改'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

'use client'

import { PencilToSquare, Plus, TrashBin } from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  NumberField,
  Spinner,
  TextArea,
  TextField,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'

import { AdminSectionHeader } from '../admin-ui'

import type { WonderCategory } from '@/lib/wonderland/domain'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { FormEvent } from 'react'

type AdminCategory = WonderCategory & { reference_count: number }

export default function WonderlandCategoryManager() {
  const modal = useOverlayState()
  const deleteDialog = useOverlayState()
  const [items, setItems] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminCategory | null>(null)
  const roots = useMemo(
    () => items.filter(item => item.scope === 'question' && item.depth === 0),
    [items],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await request<AdminCategory[]>('/admin/wonderland/categories')
      setItems(result.data)
    }
    catch {
      // request 统一处理错误提示。
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = (item: AdminCategory | null) => {
    setEditing(item)
    modal.open()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const scope = String(form.get('scope'))
    const selectedParent = String(form.get('parentId') || '')
    const payload = {
      description: String(form.get('description') || ''),
      icon: String(form.get('icon') || ''),
      id: editing?.id,
      isActive: form.has('isActive'),
      name: String(form.get('name') || ''),
      parentId: scope === 'question' && selectedParent ? selectedParent : null,
      scope,
      slug: String(form.get('slug') || ''),
      sort: Number(form.get('sort') || 1),
    }
    setSaving(true)
    try {
      const result = await request('/admin/wonderland/categories', {
        body: JSON.stringify(payload),
        method: editing ? 'PUT' : 'POST',
      })
      if (result.code === RESPONSE.SUCCESS) {
        toast.success(result.msg)
        modal.close()
        await load()
      }
    }
    catch {
      // request 统一处理错误提示。
    }
    finally {
      setSaving(false)
    }
  }

  const requestDelete = (item: AdminCategory) => {
    if (item.reference_count || items.some(child => child.parent_id === item.id)) {
      toast.warning('分类仍被内容或子分类使用，请先停用或迁移')
      return
    }
    setDeleteTarget(item)
    deleteDialog.open()
  }

  const confirmDelete = async () => {
    if (!deleteTarget)
      return
    setDeleting(true)
    try {
      await request('/admin/wonderland/categories', {
        method: 'DELETE',
        params: { id: deleteTarget.id },
      })
      toast.success('分类已删除')
      deleteDialog.close()
      setDeleteTarget(null)
      await load()
    }
    catch {
      // request 统一处理错误提示。
    }
    finally {
      setDeleting(false)
    }
  }

  return (
    <section className="admin-data-view">
      <AdminSectionHeader
        title="社区分类"
        actions={(
          <Button size="sm" onPress={() => openEditor(null)}>
            <Plus />
            新建分类
          </Button>
        )}
        description="管理问答二级分类与文章一级分类；停用不会影响历史内容。"
      />

      {loading
        ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
        : items.length
          ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-180 text-left text-sm">
                  <thead className="bg-surface-secondary text-xs text-muted">
                    <tr>
                      <th className="p-3">分类</th>
                      <th className="p-3">用途</th>
                      <th className="p-3">状态</th>
                      <th className="p-3">引用</th>
                      <th className="p-3">排序</th>
                      <th className="p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="p-3">
                          <strong>{item.depth ? `└ ${item.name}` : item.name}</strong>
                          <p className="text-[11px] text-muted">
                            /
                            {item.slug}
                          </p>
                        </td>
                        <td className="p-3">{item.scope === 'question' ? '问答' : '新闻'}</td>
                        <td className="p-3">{item.is_active ? '启用' : '停用'}</td>
                        <td className="p-3">{item.reference_count}</td>
                        <td className="p-3">{item.sort}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button aria-label="编辑分类" size="sm" variant="ghost" isIconOnly onPress={() => openEditor(item)}>
                              <PencilToSquare />
                            </Button>
                            <Button aria-label="删除分类" size="sm" variant="ghost" isIconOnly onPress={() => requestDelete(item)}>
                              <TrashBin />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          : <EmptyContent />}

      <CategoryModal
        key={editing?.id ?? 'new'}
        editing={editing}
        modal={modal}
        roots={roots}
        saving={saving}
        onSubmit={submit}
      />
      <DeleteCategoryDialog
        deleting={deleting}
        item={deleteTarget}
        state={deleteDialog}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

function CategoryModal({ editing, modal, onSubmit, roots, saving }: {
  editing: AdminCategory | null
  modal: UseOverlayStateReturn
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  roots: AdminCategory[]
  saving: boolean
}) {
  const [scope, setScope] = useState(editing?.scope ?? 'question')
  return (
    <Modal.Backdrop isOpen={modal.isOpen} onOpenChange={modal.setOpen}>
      <Modal.Container placement="center">
        <Modal.Dialog>
          <Modal.CloseTrigger aria-label="关闭分类编辑器" onPress={modal.close} />
          <Modal.Header><Modal.Heading>{editing ? '编辑分类' : '新建分类'}</Modal.Heading></Modal.Header>
          <Modal.Body>
            <Form id="wonder-category-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span>用途</span>
                <select name="scope" value={scope} onChange={event => setScope(event.target.value as 'question' | 'news')} className="h-10 rounded-lg border border-border bg-surface px-3">
                  <option value="question">问答</option>
                  <option value="news">新闻</option>
                </select>
              </label>
              {scope === 'question'
                ? (
                    <label className="flex flex-col gap-1 text-sm">
                      <span>上级分类（留空则为一级）</span>
                      <select name="parentId" defaultValue={editing?.parent_id ?? ''} className="h-10 rounded-lg border border-border bg-surface px-3">
                        <option value="">无</option>
                        {roots.filter(item => item.id !== editing?.id).map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  )
                : null}
              <TextField name="name" isRequired defaultValue={editing?.name ?? ''}>
                <Label>名称</Label>
                <Input variant="secondary" />
                <FieldError />
              </TextField>
              <TextField name="slug" isRequired defaultValue={editing?.slug ?? ''}>
                <Label>地址标识</Label>
                <Input variant="secondary" placeholder="technology" />
                <FieldError />
              </TextField>
              <TextField name="description" defaultValue={editing?.description ?? ''}>
                <Label>说明</Label>
                <TextArea variant="secondary" rows={3} />
              </TextField>
              <TextField name="icon" defaultValue={editing?.icon ?? ''}>
                <Label>图标标识（可选）</Label>
                <Input variant="secondary" />
              </TextField>
              <NumberField name="sort" defaultValue={editing?.sort ?? 1} maxValue={99} minValue={1}>
                <Label>排序</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
              <Checkbox name="isActive" defaultSelected={editing?.is_active ?? true}>
                <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                启用分类
              </Checkbox>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" slot="close" onPress={modal.close}>取消</Button>
            <Button type="submit" isPending={saving} form="wonder-category-form">保存</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function DeleteCategoryDialog({ deleting, item, onConfirm, state }: {
  deleting: boolean
  item: AdminCategory | null
  onConfirm: () => Promise<void>
  state: UseOverlayStateReturn
}) {
  return (
    <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={state.close} />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>删除分类</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            确定删除分类「
            {item?.name}
            」吗？该操作无法撤销。
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="secondary" slot="close" onPress={state.close}>取消</Button>
            <Button variant="danger" isPending={deleting} onPress={() => void onConfirm()}>确认删除</Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}

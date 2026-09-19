'use client'

import { ArrowLeft, FolderPlus, PencilToSquare, TrashBin } from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Chip,
  Spinner,
  Table,
  toast,
} from '@heroui/react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { request } from '@/lib/request'

import { AdminPageHeader } from '../admin-ui'
import {
  buildPromptCategoryRows,
  createPromptCategoryFormState,
  promptCategoryNameGridTemplate,
  summarizePromptCategories,
} from './prompt-category-model'

import type { PromptCategoryFormState } from './prompt-category-model'
import type { PromptCategory } from '@/types'
import type { FormEvent } from 'react'

const EMPTY_FORM: PromptCategoryFormState = {
  active: true,
  description: '',
  id: '',
  kind: 'web_ui',
  name: '',
  parentId: '',
  slug: '',
  sort: 1,
}

export function CategoryTable({ deleteCandidateId, deleteError, deletingId, editingId, editButtonsRef, mutationPending, onDismissDeleteError, onEdit, onRemove, rows }: {
  deleteCandidateId: string
  deleteError: string | null
  deletingId: string
  editingId: string
  editButtonsRef: React.RefObject<Map<string, HTMLButtonElement>>
  mutationPending: boolean
  onDismissDeleteError: () => void
  onEdit: (category: PromptCategory) => void
  onRemove: (category: PromptCategory) => Promise<void>
  rows: ReturnType<typeof buildPromptCategoryRows>
}) {
  return (
    <>
      {deleteError
        ? (
            <div aria-live="polite" className="prompt-category-list-error">
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>分类删除失败</Alert.Title>
                  <Alert.Description>{deleteError}</Alert.Description>
                </Alert.Content>
                <Button size="sm" variant="danger" onPress={onDismissDeleteError}>关闭</Button>
              </Alert>
            </div>
          )
        : null}
      <Table variant="secondary" className="prompt-category-table">
        <Table.ScrollContainer>
          <Table.Content aria-label="Prompt 分类列表" className="min-w-[760px]">
            <Table.Header>
              <Table.Column isRowHeader className="prompt-category-name-column">分类</Table.Column>
              <Table.Column>内容类型</Table.Column>
              <Table.Column>状态</Table.Column>
              <Table.Column>排序</Table.Column>
              <Table.Column className="text-end">操作</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="prompt-category-empty">
                  <FolderPlus aria-hidden="true" />
                  <strong>暂无分类</strong>
                  <span>使用右侧表单创建第一个根分类。</span>
                </div>
              )}
            >
              {rows.map((row) => {
                const editing = editingId === row.category.id
                const confirmingDelete = deleteCandidateId === row.category.id
                const deleting = deletingId === row.category.id
                return (
                  <Table.Row
                    key={row.category.id}
                    aria-current={editing ? 'true' : undefined}
                    id={row.category.id}
                    data-editing={editing ? 'true' : undefined}
                    className="prompt-category-row"
                  >
                    <Table.Cell>
                      <div
                        data-depth={row.depth}
                        data-orphan={row.orphan ? 'true' : undefined}
                        className="prompt-category-name"
                        style={{ gridTemplateColumns: promptCategoryNameGridTemplate(row.depth) }}
                      >
                        <span aria-hidden="true" className="prompt-category-tree-mark" />
                        <span className="min-w-0">
                          <span className="prompt-category-name-line">
                            <strong>{row.category.name}</strong>
                            <code>
                              /
                              {row.category.slug}
                            </code>
                            {editing ? <span className="prompt-category-editing-label">编辑中</span> : null}
                          </span>
                          <span className="prompt-category-description">
                            {row.orphan ? '未归属 · 上级分类不存在' : (row.category.description || (row.depth ? '场景子分类' : '根分类'))}
                          </span>
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell><Chip size="sm" variant="soft">{row.kindLabel}</Chip></Table.Cell>
                    <Table.Cell>
                      <span data-state={row.category.active ? 'active' : 'inactive'} className="prompt-category-status">
                        <span aria-hidden="true" />
                        {row.category.active ? '启用' : '停用'}
                      </span>
                    </Table.Cell>
                    <Table.Cell><span className="prompt-category-sort">{row.category.sort}</span></Table.Cell>
                    <Table.Cell>
                      <div className="prompt-category-row-actions">
                        <Button
                          ref={(button) => {
                            if (button)
                              editButtonsRef.current.set(row.category.id, button)
                            else
                              editButtonsRef.current.delete(row.category.id)
                          }}
                          aria-label={`编辑 ${row.category.name}`}
                          size="sm"
                          variant="tertiary"
                          isDisabled={mutationPending}
                          onPress={() => onEdit(row.category)}
                        >
                          <PencilToSquare aria-hidden="true" />
                          编辑
                        </Button>
                        <Button
                          aria-label={confirmingDelete ? `确认删除 ${row.category.name}` : `删除 ${row.category.name}`}
                          size="sm"
                          variant={confirmingDelete ? 'danger' : 'tertiary'}
                          isDisabled={mutationPending && !deleting}
                          isIconOnly={!confirmingDelete}
                          isPending={deleting}
                          onPress={() => void onRemove(row.category)}
                        >
                          <TrashBin aria-hidden="true" />
                          {confirmingDelete ? '确认' : null}
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </>
  )
}

export default function PromptCategoryManager() {
  const [categories, setCategories] = useState<PromptCategory[]>([])
  const [form, setForm] = useState<PromptCategoryFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
  const inspectorHeadingRef = useRef<HTMLHeadingElement>(null)
  const editButtonsRef = useRef(new Map<string, HTMLButtonElement>())

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await request<PromptCategory[]>('/admin/prompt-categories')
      setCategories(result.data)
      return true
    }
    catch (reason) {
      setLoadError(errorMessage(reason, '分类数据加载失败，请稍后重试。'))
      return false
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => buildPromptCategoryRows(categories), [categories])
  const summary = useMemo(() => summarizePromptCategories(categories), [categories])
  const roots = useMemo(() => categories.filter(category => !category.parent_id), [categories])
  const mutationPending = saving || Boolean(deletingId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mutationPending)
      return

    const editingId = form.id
    setSaving(true)
    setSaveError(null)
    try {
      await request('/admin/prompt-categories', {
        body: JSON.stringify(form),
        method: editingId ? 'PUT' : 'POST',
      })
      toast.success(editingId ? '分类已保存' : '分类已创建')
      setForm(EMPTY_FORM)
      setDeleteCandidateId('')
      const loaded = await load()
      focusAfterRender(loaded && editingId ? editButtonsRef.current.get(editingId) : pageHeadingRef.current)
    }
    catch (reason) {
      setSaveError(errorMessage(reason, editingId ? '分类保存失败，请检查后重试。' : '分类创建失败，请检查后重试。'))
    }
    finally {
      setSaving(false)
    }
  }

  const edit = (category: PromptCategory) => {
    if (mutationPending)
      return
    setSaveError(null)
    setDeleteCandidateId('')
    setForm(createPromptCategoryFormState(category))

    if (window.matchMedia('(max-width: 1279px)').matches) {
      window.requestAnimationFrame(() => {
        inspectorHeadingRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        })
        inspectorHeadingRef.current?.focus({ preventScroll: true })
      })
    }
  }

  const cancelEdit = () => {
    if (mutationPending)
      return
    const editingId = form.id
    setSaveError(null)
    setDeleteCandidateId('')
    setForm(EMPTY_FORM)
    focusAfterRender(editButtonsRef.current.get(editingId))
  }

  const remove = async (category: PromptCategory) => {
    if (mutationPending)
      return
    if (deleteCandidateId !== category.id) {
      setDeleteCandidateId(category.id)
      setDeleteError(null)
      toast.warning(`请再次点击删除“${category.name}”`)
      return
    }

    setDeletingId(category.id)
    setDeleteError(null)
    try {
      await request('/admin/prompt-categories', {
        method: 'DELETE',
        params: { id: category.id },
      })
      toast.success('分类已删除')
      setDeleteCandidateId('')
      setForm(current => current.id === category.id ? EMPTY_FORM : current)
      await load()
    }
    catch (reason) {
      setDeleteError(errorMessage(reason, `“${category.name}”删除失败，请稍后重试。`))
    }
    finally {
      setDeletingId('')
    }
  }

  return (
    <div className="prompt-category-workspace grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="admin-flat-panel min-w-0 overflow-hidden">
        <Card.Header className="block p-0">
          <AdminPageHeader
            title={<span ref={pageHeadingRef} tabIndex={-1}>Prompts 分类</span>}
            actions={(
              <Link href="/admin/prompts" className="prompt-category-back-link">
                <ArrowLeft aria-hidden="true" className="size-4" />
                返回 Prompts
              </Link>
            )}
            description="维护内容类型与场景层级"
            meta={<CategorySummary summary={summary} />}
            className="prompt-category-toolbar"
          />
        </Card.Header>
        <Card.Content className="p-0">
          {loadError
            ? (
                <div className="prompt-category-state-panel">
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>分类加载失败</Alert.Title>
                      <Alert.Description>{loadError}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" variant="danger" isPending={loading} onPress={() => void load()}>
                      重试
                    </Button>
                  </Alert>
                </div>
              )
            : loading
              ? (
                  <div role="status" className="prompt-category-loading">
                    <Spinner size="sm" />
                    <span>正在加载分类…</span>
                  </div>
                )
              : (
                  <CategoryTable
                    deleteCandidateId={deleteCandidateId}
                    deleteError={deleteError}
                    deletingId={deletingId}
                    editButtonsRef={editButtonsRef}
                    editingId={form.id}
                    mutationPending={mutationPending}
                    rows={rows}
                    onDismissDeleteError={() => setDeleteError(null)}
                    onEdit={edit}
                    onRemove={remove}
                  />
                )}
        </Card.Content>
      </Card>

      <Card className="admin-flat-panel prompt-category-inspector h-fit xl:sticky xl:top-[5.25rem]">
        <Card.Header className="prompt-category-inspector-header">
          <div>
            <h2 ref={inspectorHeadingRef} tabIndex={-1}>{form.id ? '编辑分类' : '新增分类'}</h2>
            <p>{form.id ? `正在编辑“${form.name || '未命名分类'}”` : '创建根分类或场景子分类'}</p>
          </div>
          {form.id ? <span className="prompt-category-mode">编辑中</span> : null}
        </Card.Header>
        <Card.Content className="prompt-category-inspector-content">
          {saveError
            ? (
                <div aria-live="polite" className="prompt-category-action-error">
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>操作未完成</Alert.Title>
                      <Alert.Description>{saveError}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" variant="danger" onPress={() => setSaveError(null)}>关闭</Button>
                  </Alert>
                </div>
              )
            : null}
          <form onSubmit={submit}>
            <fieldset disabled={mutationPending} className="prompt-category-form-fields">
              <Field label="名称">
                <input
                  name="name"
                  autoComplete="off"
                  maxLength={60}
                  required
                  value={form.name}
                  onChange={event => setForm(value => ({ ...value, name: event.target.value }))}
                />
              </Field>
              <Field label="地址">
                <input
                  name="slug"
                  autoComplete="off"
                  maxLength={80}
                  placeholder="留空自动生成"
                  spellCheck={false}
                  value={form.slug}
                  onChange={event => setForm(value => ({ ...value, slug: event.target.value }))}
                />
              </Field>
              <Field label="上级分类">
                <select name="parentId" value={form.parentId} onChange={event => setForm(value => ({ ...value, parentId: event.target.value }))}>
                  <option value="">无（根分类）</option>
                  {roots.filter(root => root.id !== form.id).map(root => <option key={root.id} value={root.id}>{root.name}</option>)}
                </select>
              </Field>
              {!form.parentId
                ? (
                    <Field label="内容类型">
                      <select name="kind" value={form.kind} onChange={event => setForm(value => ({ ...value, kind: event.target.value }))}>
                        {PROMPT_CONTENT_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                        <option value="general">通用</option>
                      </select>
                    </Field>
                  )
                : null}
              <Field label="说明">
                <textarea
                  name="description"
                  maxLength={240}
                  rows={3}
                  value={form.description}
                  onChange={event => setForm(value => ({ ...value, description: event.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
                <Field label="排序">
                  <input
                    name="sort"
                    type="number"
                    inputMode="numeric"
                    max={99}
                    min={1}
                    value={form.sort}
                    onChange={event => setForm(value => ({ ...value, sort: Number(event.target.value) }))}
                  />
                </Field>
                <label className="prompt-admin-check prompt-category-active-field">
                  <input name="active" type="checkbox" checked={form.active} onChange={event => setForm(value => ({ ...value, active: event.target.checked }))} />
                  <span>
                    <strong>启用分类</strong>
                    <small>可用于内容归档</small>
                  </span>
                </label>
              </div>
            </fieldset>
            <div className="prompt-category-form-actions">
              <Button type="submit" isDisabled={Boolean(deletingId)} isPending={saving} className="flex-1">
                <FolderPlus aria-hidden="true" />
                {form.id ? '保存分类' : '创建分类'}
              </Button>
              {form.id ? <Button type="button" variant="secondary" isDisabled={mutationPending} onPress={cancelEdit}>取消</Button> : null}
            </div>
          </form>
        </Card.Content>
      </Card>
    </div>
  )
}

function CategorySummary({ summary }: { summary: ReturnType<typeof summarizePromptCategories> }) {
  return (
    <dl aria-label="分类统计" className="prompt-category-summary">
      <div>
        <dt>全部</dt>
        <dd>{summary.total}</dd>
      </div>
      <div>
        <dt>根分类</dt>
        <dd>{summary.roots}</dd>
      </div>
      <div>
        <dt>子分类</dt>
        <dd>{summary.children}</dd>
      </div>
      <div data-tone={summary.inactive ? 'warning' : undefined}>
        <dt>已停用</dt>
        <dd>{summary.inactive}</dd>
      </div>
    </dl>
  )
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function Field({ children, label }: { children: React.ReactNode, label: string }) {
  return (
    <label className="prompt-admin-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function focusAfterRender(element: HTMLElement | null | undefined) {
  window.requestAnimationFrame(() => element?.focus())
}

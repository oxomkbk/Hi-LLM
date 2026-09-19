'use client'

import {
  ArrowRotateLeft,
  Eye,
  Magnifier,
  PencilToSquare,
  Plus,
  TrashBin,
  Xmark,
} from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextArea,
  TextField,
  toast,
  useOverlayState,
} from '@heroui/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { request } from '@/lib/request'
import { wonderlandDocumentText } from '@/lib/wonderland/content'

import AdminListPagination from '../admin-list-pagination'
import { AdminSectionHeader, AdminToolbar } from '../admin-ui'

import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { WonderCategory } from '@/lib/wonderland/domain'
import type { FormEvent } from 'react'

interface AdminDiscussion {
  author_name: string
  content: string
  created_at: string
  id: string
  question_slug: string
  question_title: string
  visibility: 'deleted' | 'hidden' | 'visible'
}

interface AdminQuestion {
  answer_count: number
  author_name: string
  category_name: string
  comment_count: number
  created_at: string
  id: string
  is_closed: boolean
  is_locked: boolean
  slug: string
  title: string
  visibility: 'deleted' | 'hidden' | 'visible'
}

interface AdminQuestionDetail {
  category_id: string
  content_json: WonderlandDocument
  id: string
  slug: string
  summary: string
  tag_ids: string[]
  title: string
}

interface AdminTag {
  id: string
  is_active: boolean
  name: string
  slug: string
  usage_count: number
}

type ContentType = 'answer' | 'question'
type DiscussionModerationAction = 'delete' | 'hide' | 'restore'
type QuestionModerationAction = 'close' | 'delete' | 'hide' | 'lock' | 'reopen' | 'restore' | 'unlock'

const DISCUSSION_ACTION_REASONS: Record<DiscussionModerationAction, string> = {
  delete: '后台删除回答',
  hide: '后台隐藏回答',
  restore: '后台恢复回答',
}

const QUESTION_ACTION_REASONS: Record<QuestionModerationAction, string> = {
  close: '后台关闭问题讨论',
  delete: '后台删除问题',
  hide: '后台隐藏问题',
  lock: '后台锁定问题',
  reopen: '后台重新开放问题讨论',
  restore: '后台恢复问题',
  unlock: '后台解除问题锁定',
}

const ArticleEditor = dynamic(() => import('@/components/Wonderland/article-editor'), {
  loading: () => <div className="grid min-h-64 place-items-center"><Spinner /></div>,
  ssr: false,
})

const EMPTY_DOCUMENT: WonderlandDocument = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}
const PAGE_SIZE = 20

export default function WonderlandQuestionManager() {
  const deleteDialog = useOverlayState()
  const editor = useOverlayState()
  const [items, setItems] = useState<Array<AdminDiscussion | AdminQuestion>>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [visibility, setVisibility] = useState('')
  const [type, setType] = useState<ContentType>('question')
  const [deleteTarget, setDeleteTarget] = useState<{ item: AdminDiscussion | AdminQuestion, type: ContentType } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [categories, setCategories] = useState<WonderCategory[]>([])
  const [tags, setTags] = useState<AdminTag[]>([])
  const [editing, setEditing] = useState<AdminQuestionDetail | null>(null)
  const [editorLoading, setEditorLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const requestSequenceRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current
    setLoading(true)
    setLoadError(false)
    try {
      const result = await request<{ list: Array<AdminDiscussion | AdminQuestion>, total: number }>('/admin/wonderland/questions', {
        params: { pageIndex: page - 1, pageSize: PAGE_SIZE, q, type, visibility },
      })
      if (requestId !== requestSequenceRef.current)
        return
      const nextPage = normalizeAdminPage(page, result.data.total, PAGE_SIZE)
      if (nextPage !== page) {
        setPage(nextPage)
        return
      }
      setItems(result.data.list)
      setTotal(result.data.total)
    }
    catch {
      if (requestId === requestSequenceRef.current)
        setLoadError(true)
      // request 统一处理错误提示。
    }
    finally {
      if (requestId === requestSequenceRef.current)
        setLoading(false)
    }
  }, [page, q, type, visibility])

  useEffect(() => {
    void load()
    return () => {
      requestSequenceRef.current += 1
    }
  }, [load])

  const moderate = async (item: AdminQuestion, action: QuestionModerationAction, moderationReason = QUESTION_ACTION_REASONS[action]) => {
    setPending(`${item.id}:${action}`)
    try {
      await request(`/admin/wonderland/questions/${item.id}`, {
        body: JSON.stringify({ action, reason: moderationReason }),
        method: 'PATCH',
      })
      toast.success('问题状态已更新')
      await load()
      return true
    }
    catch {
      // request 统一处理错误提示。
      return false
    }
    finally {
      setPending(null)
    }
  }

  const moderateDiscussion = async (item: AdminDiscussion, action: DiscussionModerationAction, moderationReason = DISCUSSION_ACTION_REASONS[action]) => {
    setPending(`${item.id}:${action}`)
    try {
      await request(`/admin/wonderland/discussion/answer/${item.id}`, {
        body: JSON.stringify({ action, reason: moderationReason }),
        method: 'PATCH',
      })
      toast.success('讨论内容状态已更新')
      await load()
      return true
    }
    catch {
      // request 统一处理错误提示。
      return false
    }
    finally {
      setPending(null)
    }
  }

  const requestDelete = (item: AdminDiscussion | AdminQuestion, targetType: ContentType) => {
    setDeleteTarget({ item, type: targetType })
    setDeleteReason(targetType === 'question' ? QUESTION_ACTION_REASONS.delete : DISCUSSION_ACTION_REASONS.delete)
    deleteDialog.open()
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleteReason.trim().length < 2)
      return
    const success = deleteTarget.type === 'question'
      ? await moderate(deleteTarget.item as AdminQuestion, 'delete', deleteReason.trim())
      : await moderateDiscussion(deleteTarget.item as AdminDiscussion, 'delete', deleteReason.trim())
    if (!success)
      return
    deleteDialog.close()
    setDeleteTarget(null)
    setDeleteReason('')
  }

  const openEditor = async (item?: AdminQuestion) => {
    setEditing(null)
    editor.open()
    setEditorLoading(true)
    try {
      const [categoryList, tagList, detail] = await Promise.all([
        request<WonderCategory[]>('/admin/wonderland/categories'),
        request<AdminTag[]>('/admin/wonderland/questions', { params: { meta: 'tags' } }),
        item ? request<AdminQuestionDetail>('/admin/wonderland/questions', { params: { id: item.id } }) : Promise.resolve(null),
      ])
      setCategories(categoryList.data.filter(category => category.scope === 'question'))
      setTags(tagList.data)
      setEditing(detail?.data ?? null)
    }
    catch {
      editor.close()
    }
    finally {
      setEditorLoading(false)
    }
  }

  return (
    <section className="admin-data-view">
      <AdminSectionHeader title="问答管理" description="维护问题、回答及可见状态；审核操作会保留记录。" />
      <AdminToolbar>
        <select
          aria-label="内容类型" value={type} onChange={(event) => {
            setPage(1)
            setType(event.target.value as ContentType)
          }} className="h-9 rounded-lg border border-border bg-surface px-3 text-xs"
        >
          <option value="question">问题</option>
          <option value="answer">回答</option>
        </select>
        <Input
          aria-label={type === 'question' ? '搜索问题' : '搜索回答'} variant="secondary" placeholder={type === 'question' ? '搜索标题或摘要' : '搜索回答内容'} value={q} onChange={(event) => {
            setPage(1)
            setQ(event.target.value)
          }}
        />
        <select
          aria-label="可见状态" value={visibility} onChange={(event) => {
            setPage(1)
            setVisibility(event.target.value)
          }} className="h-9 rounded-lg border border-border bg-surface px-3 text-xs"
        >
          <option value="">使用中</option>
          <option value="visible">公开</option>
          <option value="hidden">已隐藏</option>
          <option value="deleted">回收站</option>
        </select>
        <Button size="sm" onPress={() => void load()}>
          <Magnifier />
          查询
        </Button>
        <Button
          size="sm" variant="secondary" onPress={() => {
            setPage(1)
            setType('question')
            setQ('')
            setVisibility('')
          }}
        >
          <ArrowRotateLeft />
          重置
        </Button>
        {type === 'question'
          ? (
              <Button size="sm" onPress={() => void openEditor()}>
                <Plus />
                新建问题
              </Button>
            )
          : null}
      </AdminToolbar>
      {loadError
        ? (
            <div role="alert" className="flex items-center justify-center gap-3 py-12 text-danger">
              列表加载失败，请重试。
              <Button size="sm" variant="secondary" onPress={() => void load()}>重试</Button>
            </div>
          )
        : loading
          ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
          : items.length
            ? (
                type === 'question'
                  ? <QuestionTable items={items as AdminQuestion[]} pending={pending} onEdit={item => void openEditor(item)} onModerate={moderate} onRequestDelete={item => requestDelete(item, 'question')} />
                  : <DiscussionTable items={items as AdminDiscussion[]} pending={pending} onModerate={moderateDiscussion} onRequestDelete={item => requestDelete(item, 'answer')} />
              )
            : <EmptyContent />}
      {!loadError && total > 0
        ? <div className="border-t border-border py-4"><AdminListPagination loading={loading} page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /></div>
        : null}
      <AlertDialog.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={Boolean(pending)}
        isOpen={deleteDialog.isOpen}
        onOpenChange={(open) => {
          deleteDialog.setOpen(open)
          if (!open && !pending) {
            setDeleteTarget(null)
            setDeleteReason('')
          }
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={deleteDialog.close} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>
                删除
                {deleteTarget?.type === 'answer' ? '回答' : '问题'}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>内容会立即从前台移除，并进入回收站，可随时恢复。</p>
              <blockquote className="mt-3 line-clamp-3 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-muted">
                {deleteTarget
                  ? deleteTarget.type === 'question'
                    ? (deleteTarget.item as AdminQuestion).title
                    : (deleteTarget.item as AdminDiscussion).content
                  : ''}
              </blockquote>
              <TextField isRequired value={deleteReason} onChange={setDeleteReason} className="mt-4">
                <Label>操作原因</Label>
                <Input variant="secondary" maxLength={1000} placeholder="填写删除原因" />
                <FieldError />
              </TextField>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close" onPress={deleteDialog.close}>取消</Button>
              <Button
                variant="danger"
                isDisabled={deleteReason.trim().length < 2}
                isPending={pending === `${deleteTarget?.item.id}:delete`}
                onPress={() => void confirmDelete()}
              >
                移入回收站
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
      <QuestionEditor
        key={`${editing?.id ?? 'new'}-${editor.isOpen ? 'open' : 'closed'}`}
        categories={categories}
        editing={editing}
        loading={editorLoading}
        modal={editor}
        tags={tags}
        onSaved={async () => {
          editor.close()
          await load()
        }}
      />
    </section>
  )
}

function ActionButton({ action, children, item, onAction, pending }: {
  action: QuestionModerationAction
  children: React.ReactNode
  item: AdminQuestion
  onAction: (item: AdminQuestion, action: QuestionModerationAction) => Promise<boolean>
  pending: string | null
}) {
  return <Button size="sm" variant="secondary" isDisabled={Boolean(pending)} isPending={pending === `${item.id}:${action}`} onPress={() => void onAction(item, action)}>{children}</Button>
}

function DiscussionTable({ items, onModerate, onRequestDelete, pending }: {
  items: AdminDiscussion[]
  onModerate: (item: AdminDiscussion, action: DiscussionModerationAction) => Promise<boolean>
  onRequestDelete: (item: AdminDiscussion) => void
  pending: string | null
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-200 text-left text-sm">
        <thead className="bg-surface-secondary text-xs text-muted">
          <tr>
            <th className="p-3">回答</th>
            <th className="p-3">所属问题</th>
            <th className="p-3">作者</th>
            <th className="p-3">状态</th>
            <th className="p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-border">
              <td className="max-w-lg p-3">
                <p className="line-clamp-3">{item.content}</p>
                <small className="mt-1 block text-muted">{new Date(item.created_at).toLocaleString('zh-CN')}</small>
              </td>
              <td className="max-w-xs p-3"><Link href={`/wonderland/questions/${item.question_slug}`} target="_blank" className="hover:underline">{item.question_title}</Link></td>
              <td className="p-3">{item.author_name}</td>
              <td className="p-3">{item.visibility === 'visible' ? '公开' : item.visibility === 'hidden' ? '已隐藏' : '已删除'}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1.5">
                  {item.visibility === 'deleted'
                    ? (
                        <Button size="sm" variant="secondary" isDisabled={Boolean(pending)} isPending={pending === `${item.id}:restore`} onPress={() => void onModerate(item, 'restore')}>
                          恢复
                        </Button>
                      )
                    : (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={Boolean(pending)}
                            isPending={pending === `${item.id}:${item.visibility === 'visible' ? 'hide' : 'restore'}`}
                            onPress={() => void onModerate(item, item.visibility === 'visible' ? 'hide' : 'restore')}
                          >
                            {item.visibility === 'visible' ? '隐藏' : '恢复'}
                          </Button>
                          <Button size="sm" variant="danger" isDisabled={Boolean(pending)} onPress={() => onRequestDelete(item)}>
                            <TrashBin />
                            删除
                          </Button>
                        </>
                      )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QuestionEditor({ categories, editing, loading, modal, onSaved, tags }: {
  categories: WonderCategory[]
  editing: AdminQuestionDetail | null
  loading: boolean
  modal: ReturnType<typeof useOverlayState>
  onSaved: () => Promise<void>
  tags: AdminTag[]
}) {
  const [content, setContent] = useState<WonderlandDocument>(editing?.content_json ?? EMPTY_DOCUMENT)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)

  if (!modal.isOpen)
    return null

  const closeEditor = () => {
    if (saving || uploading)
      return
    // eslint-disable-next-line no-alert -- a synchronous choice is required before discarding unsaved content
    if (dirty && !window.confirm('当前问题还有未保存修改，确定关闭吗？'))
      return
    modal.close()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (wonderlandDocumentText(content).length < 30) {
      toast.warning('问题正文不能少于 30 个字符')
      return
    }
    setSaving(true)
    try {
      const payload = {
        categoryId: String(form.get('categoryId') || ''),
        content,
        id: editing?.id,
        summary: String(form.get('summary') || ''),
        tagIds: form.getAll('tagIds').map(String),
        title: String(form.get('title') || ''),
      }
      await request('/admin/wonderland/questions', { body: JSON.stringify(payload), method: editing ? 'PUT' : 'POST' })
      toast.success(editing ? '问题已更新' : '问题已创建')
      setDirty(false)
      await onSaved()
    }
    catch {
      // request 统一展示错误。
    }
    finally {
      setSaving(false)
    }
  }

  if (loading)
    return <div aria-busy="true" className="fixed inset-0 z-[80] grid place-items-center bg-white"><Spinner /></div>

  return (
    <div onInputCapture={() => setDirty(true)} className="editor-studio-business-form">
      <Form key={editing?.id ?? 'new'} id="wonder-admin-question-form" onSubmit={submit} className="contents">
        <ArticleEditor
          disabled={saving}
          documentHeader={(
            <EditorStudioDocumentHeader>
              <TextField name="title" isRequired defaultValue={editing?.title ?? ''} maxLength={160} minLength={8}>
                <Label>问题标题</Label>
                <Input variant="secondary" placeholder="写一个清晰、可搜索的问题标题" />
                <FieldError />
              </TextField>
              <TextField name="summary" isRequired defaultValue={editing?.summary ?? ''} maxLength={300} minLength={20}>
                <Label>问题摘要</Label>
                <TextArea variant="secondary" placeholder="用一两句话说明问题背景和期望得到的答案" rows={2} />
                <FieldError />
              </TextField>
            </EditorStudioDocumentHeader>
          )}
          initialDocument={editing?.content_json}
          maxImages={8}
          placeholder="从这里开始描述问题，支持 Markdown、代码、列表和粘贴图片…"
          saveState={saving ? 'saving' : dirty ? 'idle' : editing ? 'saved' : 'idle'}
          studio={{
            actions: (
              <>
                <Button
                  aria-label="关闭问题编辑器"
                  type="button"
                  size="sm"
                  variant="tertiary"
                  isDisabled={saving || uploading}
                  onPress={closeEditor}
                >
                  <Xmark />
                  关闭
                </Button>
                <Button type="submit" size="sm" variant="primary" isDisabled={saving || uploading} isPending={saving}>{saving ? '保存中…' : editing ? '保存修改' : '创建问题'}</Button>
              </>
            ),
            backHref: '#',
            backLabel: '问答管理',
            brand: 'Hi LLM Admin',
            brandHref: '/admin',
            documentLabel: editing ? '编辑问题' : '新建问题',
            inspector: (
              <div className="prompt-admin-studio-inspector">
                <EditorStudioSection title="问题分类" description="选择最具体的分类，让合适的人更快看到。">
                  <label className="wonderland-admin-field">
                    <span>
                      分类
                      <i>*</i>
                    </span>
                    <select name="categoryId" defaultValue={editing?.category_id ?? ''} disabled={saving || uploading} required>
                      <option disabled value="">请选择分类</option>
                      {categories.map(category => <option key={category.id} value={category.id}>{category.depth ? `└ ${category.name}` : category.name}</option>)}
                    </select>
                  </label>
                </EditorStudioSection>
                {tags.length
                  ? (
                      <EditorStudioSection title="问题标签" defaultOpen={false} description="最多选择 5 个标签，帮助内容被准确检索。">
                        <fieldset className="wonderland-admin-tag-list">
                          <legend className="sr-only">问题标签（最多 5 个）</legend>
                          {tags.map(tag => (
                            <Checkbox key={tag.id} name="tagIds" isDisabled={!tag.is_active || saving || uploading} defaultSelected={editing?.tag_ids.includes(tag.id) ?? false} value={tag.id}>
                              <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                              {tag.name}
                            </Checkbox>
                          ))}
                        </fieldset>
                      </EditorStudioSection>
                    )
                  : null}
                <EditorStudioSection title="发布检查" defaultOpen={false} description="保存前会校验标题、摘要、分类和正文长度。">
                  <p className="prompt-admin-save-hint">正文至少 30 个字符；保存后问题会沿用当前可见状态。</p>
                </EditorStudioSection>
              </div>
            ),
            inspectorFooter: (
              <>
                <Button type="button" variant="secondary" isDisabled={saving || uploading} onPress={closeEditor}>取消</Button>
                <Button type="submit" variant="primary" isDisabled={saving || uploading} isPending={saving}>{uploading ? '正在上传图片' : '保存问题'}</Button>
              </>
            ),
            discardAction: <Button type="button" variant="ghost" isDisabled={saving || uploading} onPress={closeEditor}>{dirty ? '关闭并确认' : '关闭编辑器'}</Button>,
            inspectorTitle: '问题发布设置',
            onBack: closeEditor,
            statusLabel: saving ? '正在保存…' : dirty ? '有未保存修改' : editing ? '已加载' : '尚未保存',
            statusTone: saving ? 'saving' : dirty ? 'neutral' : editing ? 'success' : 'neutral',
          }}
          onChange={(next) => {
            setDirty(true)
            setContent(next)
          }}
          onSaveShortcut={() => (document.getElementById('wonder-admin-question-form') as HTMLFormElement | null)?.requestSubmit()}
          onUploadStateChange={setUploading}
        />
      </Form>
    </div>
  )
}

function QuestionTable({ items, onEdit, onModerate, onRequestDelete, pending }: {
  items: AdminQuestion[]
  onEdit: (item: AdminQuestion) => void
  onModerate: (item: AdminQuestion, action: QuestionModerationAction) => Promise<boolean>
  onRequestDelete: (item: AdminQuestion) => void
  pending: string | null
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-240 text-left text-sm">
        <thead className="bg-surface-secondary text-xs text-muted">
          <tr>
            <th className="p-3">问题</th>
            <th className="p-3">作者</th>
            <th className="p-3">分类</th>
            <th className="p-3">讨论</th>
            <th className="p-3">状态</th>
            <th className="p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-border">
              <td className="max-w-md p-3">
                <strong className="line-clamp-2">{item.title}</strong>
                <small className="mt-1 block text-muted">{new Date(item.created_at).toLocaleDateString('zh-CN')}</small>
              </td>
              <td className="p-3">{item.author_name}</td>
              <td className="p-3">{item.category_name}</td>
              <td className="p-3 text-xs">
                {item.answer_count}
                {' '}
                回答 ·
                {' '}
                {item.comment_count}
                {' '}
                评论
              </td>
              <td className="p-3 text-xs">
                {item.visibility === 'visible' ? '公开' : item.visibility === 'hidden' ? '已隐藏' : '已删除'}
                {' '}
                ·
                {' '}
                {item.is_closed ? '已关闭' : '开放'}
                {' '}
                ·
                {' '}
                {item.is_locked ? '已锁定' : '未锁定'}
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {item.visibility === 'deleted'
                    ? <ActionButton action="restore" item={item} pending={pending} onAction={onModerate}>恢复</ActionButton>
                    : (
                        <>
                          <Link aria-label="预览问题" href={`/wonderland/questions/${item.slug}`} target="_blank" className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><Eye className="size-4" /></Link>
                          <Button aria-label="编辑问题" size="sm" variant="ghost" isIconOnly onPress={() => onEdit(item)}><PencilToSquare /></Button>
                          <ActionButton action={item.visibility === 'visible' ? 'hide' : 'restore'} item={item} pending={pending} onAction={onModerate}>{item.visibility === 'visible' ? '隐藏' : '恢复'}</ActionButton>
                          <ActionButton action={item.is_closed ? 'reopen' : 'close'} item={item} pending={pending} onAction={onModerate}>{item.is_closed ? '重开' : '关闭'}</ActionButton>
                          <ActionButton action={item.is_locked ? 'unlock' : 'lock'} item={item} pending={pending} onAction={onModerate}>{item.is_locked ? '解锁' : '锁定'}</ActionButton>
                          <Button
                            size="sm"
                            variant="danger"
                            isDisabled={Boolean(pending)}
                            onPress={() => onRequestDelete(item)}
                          >
                            <TrashBin />
                            删除
                          </Button>
                        </>
                      )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

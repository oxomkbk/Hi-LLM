'use client'

import { Eye, PencilToSquare, Plus, TrashBin } from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Input,
  Spinner,
  toast,
  useOverlayState,
} from '@heroui/react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'

import { AdminSectionHeader, AdminToolbar } from '../admin-ui'

import type { WonderCategory, WonderNewsStatus } from '@/lib/wonderland/domain'

interface AdminNews {
  category: Pick<WonderCategory, 'id' | 'name' | 'slug'>
  category_id: string
  cover_file_id: string | null
  created_at: string
  featured: boolean
  id: string
  pinned: boolean
  published_at: string | null
  scheduled_at: string | null
  seo_description: string | null
  seo_title: string | null
  slug: string
  sort: number
  status: WonderNewsStatus
  summary: string
  title: string
  updated_at: string
}

interface NewsListFilters {
  pageIndex: number
  q: string
  status: string
}

const PAGE_SIZE = 20

export default function WonderlandNewsManager({ initialFilters = { pageIndex: 0, q: '', status: '' } }: {
  initialFilters?: NewsListFilters
}) {
  const deleteDialog = useOverlayState()
  const [items, setItems] = useState<AdminNews[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminNews | null>(null)
  const [q, setQ] = useState(initialFilters.q)
  const [status, setStatus] = useState(initialFilters.status)
  const [pageIndex, setPageIndex] = useState(initialFilters.pageIndex)
  const [total, setTotal] = useState(0)
  const requestSequenceRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current
    setLoading(true)
    try {
      const news = await request<{ list: AdminNews[], total: number }>('/admin/wonderland/news', {
        params: { pageIndex, pageSize: PAGE_SIZE, q, status },
      })
      if (requestId !== requestSequenceRef.current)
        return
      const nextPage = normalizeAdminPage(pageIndex + 1, news.data.total, PAGE_SIZE) - 1
      if (nextPage !== pageIndex) {
        setPageIndex(nextPage)
        return
      }
      setItems(news.data.list)
      setTotal(news.data.total)
    }
    catch {
      // request 统一处理错误提示。
    }
    finally {
      if (requestId === requestSequenceRef.current)
        setLoading(false)
    }
  }, [pageIndex, q, status])

  useEffect(() => {
    void load()
    return () => {
      requestSequenceRef.current += 1
    }
  }, [load])

  useEffect(() => {
    window.history.replaceState(window.history.state, '', newsListHref({ pageIndex, q, status }))
  }, [pageIndex, q, status])

  const requestDelete = (item: AdminNews) => {
    setDeleteTarget(item)
    deleteDialog.open()
  }

  const confirmDelete = async () => {
    if (!deleteTarget)
      return
    setDeleting(true)
    try {
      await request('/admin/wonderland/news', {
        method: 'DELETE',
        params: { id: deleteTarget.id },
      })
      toast.success('新闻已删除')
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
        title="文章管理"
        actions={(
          <Link
            href={buildContextualHref('/admin/wonderland/news/new', newsListHref({ pageIndex, q, status }))}
            className="inline-flex h-8 items-center gap-2 rounded bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-85"
          >
            <Plus className="size-4" />
            新建文章
          </Link>
        )}
        description="维护社区新闻、专题文章及其发布状态"
      />
      <AdminToolbar>
        <Input
          aria-label="搜索新闻" variant="secondary" placeholder="标题或摘要" value={q} onChange={(event) => {
            setPageIndex(0)
            setQ(event.target.value)
          }}
          className="min-w-[220px] flex-1 lg:max-w-[360px]"
        />
        <select
          aria-label="发布状态" value={status} onChange={(event) => {
            setPageIndex(0)
            setStatus(event.target.value)
          }} className="h-9 min-w-36 rounded-lg border border-border bg-surface px-3 text-xs"
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="scheduled">定时</option>
          <option value="published">已发布</option>
          <option value="archived">已归档</option>
        </select>
        <span className="admin-result-count">
          共
          {total}
          {' '}
          篇
        </span>
      </AdminToolbar>

      {loading
        ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
        : items.length
          ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-200 text-left text-sm">
                  <thead className="bg-surface-secondary text-xs text-muted">
                    <tr>
                      <th className="p-3">标题</th>
                      <th className="p-3">分类</th>
                      <th className="p-3">状态</th>
                      <th className="p-3">属性</th>
                      <th className="p-3">更新</th>
                      <th className="p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="max-w-md p-3">
                          <strong className="line-clamp-1">{item.title}</strong>
                          <p className="mt-1 line-clamp-1 text-[11px] text-muted">{item.summary}</p>
                        </td>
                        <td className="p-3">{item.category.name}</td>
                        <td className="p-3"><StatusLabel status={item.status} /></td>
                        <td className="p-3 text-xs text-muted">{[item.pinned ? '置顶' : '', item.featured ? '精选' : ''].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="p-3 text-xs text-muted">{new Date(item.updated_at).toLocaleDateString('zh-CN')}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {item.status === 'published'
                              ? (
                                  <Link aria-label="打开新闻" href={`/wonderland/news/${item.slug}`} target="_blank" className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary">
                                    <Eye className="size-4" />
                                  </Link>
                                )
                              : null}
                            <Link aria-label="编辑新闻" href={buildContextualHref(`/admin/wonderland/news/${item.id}/edit`, newsListHref({ pageIndex, q, status }))} className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary">
                              <PencilToSquare className="size-4" />
                            </Link>
                            <Button aria-label="删除新闻" size="sm" variant="ghost" isIconOnly onPress={() => requestDelete(item)}><TrashBin /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          : <EmptyContent />}

      {total > 0
        ? (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted">
                第
                {' '}
                {pageIndex + 1}
                {' '}
                /
                {' '}
                {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                {' '}
                页
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" isDisabled={pageIndex <= 0 || loading} onPress={() => setPageIndex(value => Math.max(0, value - 1))}>上一页</Button>
                <Button size="sm" variant="secondary" isDisabled={(pageIndex + 1) * PAGE_SIZE >= total || loading} onPress={() => setPageIndex(value => value + 1)}>下一页</Button>
              </div>
            </div>
          )
        : null}

      <DeleteNewsDialog deleting={deleting} item={deleteTarget} state={deleteDialog} onConfirm={confirmDelete} />
    </section>
  )
}

function DeleteNewsDialog({ deleting, item, onConfirm, state }: {
  deleting: boolean
  item: AdminNews | null
  onConfirm: () => Promise<void>
  state: ReturnType<typeof useOverlayState>
}) {
  return (
    <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={state.close} />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>删除新闻</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            确定删除新闻「
            {item?.title}
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

function newsListHref(filters: NewsListFilters) {
  const params = new URLSearchParams()
  if (filters.q.trim())
    params.set('q', filters.q.trim())
  if (filters.status)
    params.set('status', filters.status)
  if (filters.pageIndex > 0)
    params.set('page', String(filters.pageIndex + 1))
  return params.size ? `/admin/wonderland/news?${params}` : '/admin/wonderland/news'
}

function StatusLabel({ status }: { status: WonderNewsStatus }) {
  const label = { archived: '已归档', draft: '草稿', published: '已发布', scheduled: '定时' }[status]
  const style = status === 'published'
    ? 'bg-success-soft text-success-soft-foreground'
    : status === 'scheduled'
      ? 'bg-warning-soft text-warning-soft-foreground'
      : 'bg-surface-secondary text-muted'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${style}`}>{label}</span>
}

'use client'

import {
  ArrowRotateLeft,
  Eye,
  Magnifier,
  PencilToSquare,
  Plus,
  TrashBin,
} from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Chip,
  SearchField,
  Spinner,
  TextArea,
  toast,
  useOverlayState,
} from '@heroui/react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'
import { workKindLabel } from '@/lib/wonderland/work-kinds'

import { AdminSectionHeader, AdminToolbar } from '../admin-ui'

interface AdminWork {
  author_name: string
  created_at: string
  id: string
  kind: string
  like_count: number
  slug: string
  summary: string
  title: string
  view_count: number
  visibility: 'deleted' | 'hidden' | 'visible'
}

interface AdminWorkPage {
  list: AdminWork[]
  pageIndex: number
  pageSize: number
  total: number
}

const PAGE_SIZE = 20

export default function WonderlandWorkManager() {
  const deleteDialog = useOverlayState()
  const [data, setData] = useState<AdminWorkPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [qDraft, setQDraft] = useState('')
  const [visibilityDraft, setVisibilityDraft] = useState('')
  const [filters, setFilters] = useState({ q: '', visibility: '' })
  const [pageIndex, setPageIndex] = useState(0)
  const [reason, setReason] = useState('后台审核与内容管理')
  const [deleteTarget, setDeleteTarget] = useState<AdminWork | null>(null)
  const requestSequenceRef = useRef(0)
  const items = data?.list ?? []
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await request<AdminWorkPage>('/admin/wonderland/works', {
        params: { pageIndex, pageSize: PAGE_SIZE, q: filters.q || undefined, visibility: filters.visibility || undefined },
      })
      if (requestId !== requestSequenceRef.current)
        return
      const nextPage = normalizeAdminPage(pageIndex + 1, result.data.total, PAGE_SIZE) - 1
      if (nextPage !== pageIndex) {
        setPageIndex(nextPage)
        return
      }
      setData(result.data)
    }
    catch (cause) {
      if (requestId !== requestSequenceRef.current)
        return
      setError(cause instanceof Error ? cause.message : '作品列表加载失败')
    }
    finally {
      if (requestId === requestSequenceRef.current)
        setLoading(false)
    }
  }, [filters, pageIndex])

  useEffect(() => {
    void load()
    return () => {
      requestSequenceRef.current += 1
    }
  }, [load])

  const moderate = async (item: AdminWork, action: 'delete' | 'hide' | 'restore') => {
    if (reason.trim().length < 2) {
      toast.warning('请填写至少 2 个字的审核原因')
      return false
    }
    setPending(item.id)
    try {
      await request(`/admin/wonderland/works/${item.id}`, {
        body: JSON.stringify({ action, reason: reason.trim() }),
        method: 'PATCH',
      })
      toast.success(action === 'hide' ? '作品已从前台隐藏' : action === 'delete' ? '作品已移入回收站' : '作品已恢复公开')
      await load()
      return true
    }
    catch {
      // The request layer reports the error; keep the existing row unchanged.
      return false
    }
    finally {
      setPending(null)
    }
  }

  const requestDelete = (item: AdminWork) => {
    setDeleteTarget(item)
    deleteDialog.open()
  }

  const confirmDelete = async () => {
    if (!deleteTarget)
      return
    if (await moderate(deleteTarget, 'delete')) {
      deleteDialog.close()
      setDeleteTarget(null)
    }
  }

  return (
    <section className="admin-data-view">
      <AdminSectionHeader
        title="作品管理"
        actions={(
          <div className="flex items-center gap-3">
            <span data-tone="neutral" className="admin-ui-status">
              {data
                ? `共 ${data.total} 个作品`
                : '正在读取作品'}
            </span>
            <Link
              href="/admin/wonderland/works/new"
              className="inline-flex h-8 items-center gap-2 rounded bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-85"
            >
              <Plus className="size-4" />
              新建作品
            </Link>
          </div>
        )}
        description="审核社区成员发布的外链作品和展示信息"
      />
      <AdminToolbar>
        <SearchField aria-label="搜索作品" value={qDraft} onChange={setQDraft} className="min-w-[240px] flex-1 lg:max-w-[360px]">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="作品、简介或作者" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <select aria-label="作品状态" value={visibilityDraft} onChange={event => setVisibilityDraft(event.target.value)} className="h-9 min-w-36 rounded-lg border border-border bg-surface px-3 text-xs">
          <option value="">全部状态</option>
          <option value="visible">公开</option>
          <option value="hidden">已隐藏</option>
          <option value="deleted">已删除</option>
        </select>
        <Button
          size="sm" isPending={loading} onPress={() => {
            setPageIndex(0)
            setFilters({ q: qDraft.trim(), visibility: visibilityDraft })
          }}
        >
          <Magnifier />
          查询
        </Button>
        <Button
          size="sm" variant="secondary" onPress={() => {
            setQDraft('')
            setVisibilityDraft('')
            setPageIndex(0)
            setFilters({ q: '', visibility: '' })
          }}
        >
          <ArrowRotateLeft />
          重置
        </Button>
        <TextArea
          aria-label="作品操作原因"
          variant="secondary"
          rows={1}
          value={reason}
          onChange={event => setReason(event.target.value)}
          className="min-w-[260px] flex-1 xl:ml-auto xl:max-w-[420px]"
        />
      </AdminToolbar>
      {error
        ? (
            <div role="alert" className="admin-list-error">
              <strong>作品列表暂时不可用</strong>
              <span>{error}</span>
              <Button size="sm" variant="secondary" onPress={() => void load()}>重试</Button>
            </div>
          )
        : loading && !data
          ? <div className="grid min-h-52 place-items-center"><Spinner /></div>
          : items.length
            ? (
                <div className="admin-native-table-wrap">
                  <table className="admin-native-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>作品</th>
                        <th>作者</th>
                        <th>数据</th>
                        <th>状态</th>
                        <th>发布时间</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id}>
                          <td className="max-w-lg">
                            <strong className="block">{item.title}</strong>
                            <span className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{item.summary}</span>
                            <Chip size="sm" variant="soft" className="mt-1.5">{workKindLabel(item.kind)}</Chip>
                          </td>
                          <td className="text-xs">{item.author_name}</td>
                          <td className="text-xs">
                            {item.like_count}
                            {' '}
                            喜欢 ·
                            {' '}
                            {item.view_count}
                            {' '}
                            浏览
                          </td>
                          <td><Chip color={item.visibility === 'visible' ? 'success' : item.visibility === 'hidden' ? 'warning' : 'default'} size="sm" variant="soft">{visibilityLabel(item.visibility)}</Chip></td>
                          <td className="text-xs text-muted">{formatDate(item.created_at, 'datetime')}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              {item.visibility === 'visible'
                                ? <Link aria-label={`查看 ${item.title}`} href={`/wonderland/works/${item.slug}`} target="_blank" className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><Eye /></Link>
                                : null}
                              {item.visibility !== 'deleted'
                                ? <Link aria-label={`编辑 ${item.title}`} href={buildContextualHref(`/admin/wonderland/works/${item.id}/edit`, `/admin/wonderland/works?pageIndex=${pageIndex}`)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><PencilToSquare /></Link>
                                : null}
                              <Button size="sm" variant="secondary" isDisabled={Boolean(pending)} isPending={pending === item.id} onPress={() => void moderate(item, item.visibility === 'visible' ? 'hide' : 'restore')}>
                                {item.visibility === 'visible'
                                  ? '隐藏'
                                  : (
                                      <>
                                        <ArrowRotateLeft />
                                        恢复
                                      </>
                                    )}
                              </Button>
                              {item.visibility !== 'deleted'
                                ? (
                                    <Button
                                      aria-label={`删除 ${item.title}`}
                                      size="sm"
                                      variant="ghost"
                                      isDisabled={Boolean(pending)}
                                      isIconOnly
                                      onPress={() => requestDelete(item)}
                                    >
                                      <TrashBin />
                                    </Button>
                                  )
                                : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            : <EmptyContent />}
      {data && data.total > 0
        ? (
            <footer className="admin-list-footer">
              <span>
                第
                {pageIndex + 1}
                {' '}
                /
                {pageCount}
                {' '}
                页 · 每页
                {PAGE_SIZE}
                {' '}
                条
              </span>
              <div>
                <Button size="sm" variant="secondary" isDisabled={pageIndex <= 0 || loading} onPress={() => setPageIndex(value => Math.max(0, value - 1))}>上一页</Button>
                <Button size="sm" variant="secondary" isDisabled={pageIndex >= pageCount - 1 || loading} onPress={() => setPageIndex(value => value + 1)}>下一页</Button>
              </div>
            </footer>
          )
        : null}
      <AlertDialog.Backdrop isOpen={deleteDialog.isOpen} onOpenChange={open => !open && deleteDialog.close()}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={() => deleteDialog.close()} />
            <AlertDialog.Header>
              <AlertDialog.Icon />
              <AlertDialog.Heading>移入回收站？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                作品“
                {deleteTarget?.title}
                ”会从前台隐藏，但仍可在“已删除”筛选中恢复。
              </p>
              <TextArea
                aria-label="删除处理原因"
                rows={2}
                value={reason}
                onChange={event => setReason(event.target.value)}
                className="mt-3"
              />
              <p className="mt-2 text-xs text-muted">处理原因会写入审核记录。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close">取消</Button>
              <Button variant="danger" isPending={pending === deleteTarget?.id} onPress={() => void confirmDelete()}>移入回收站</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </section>
  )
}

function visibilityLabel(visibility: AdminWork['visibility']) {
  return { deleted: '已删除', hidden: '已隐藏', visible: '公开' }[visibility]
}

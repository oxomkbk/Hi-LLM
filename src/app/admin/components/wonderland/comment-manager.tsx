'use client'

import { ArrowRotateLeft, Eye, Magnifier, Picture } from '@gravity-ui/icons'
import {
  Button,
  Chip,
  Input,
  Spinner,
  Table,
  TextArea,
  toast,
} from '@heroui/react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { markdownPlainText } from '@/lib/content/markdown'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import { AdminSectionHeader, AdminToolbar } from '../admin-ui'

interface AdminComment {
  author_name: string
  body: string
  created_at: string
  id: string
  image_count: number
  target_slug: string
  target_title: string
  target_type: 'answer' | 'news' | 'question'
  visibility: 'deleted' | 'hidden' | 'visible'
}

interface CommentPage {
  list: AdminComment[]
  pageIndex: number
  pageSize: number
  total: number
}

const PAGE_SIZE = 20

export default function WonderlandCommentManager() {
  const [data, setData] = useState<CommentPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [reason, setReason] = useState('后台评论审核处理')
  const [targetType, setTargetType] = useState('')
  const [visibility, setVisibility] = useState('')
  const paramsRef = useRef({ pageIndex: 0, pageSize: PAGE_SIZE, q: '', targetType: '', visibility: '' })
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const items = useMemo(() => data?.list ?? [], [data])

  const load = useCallback(async (overrides: Partial<typeof paramsRef.current> = {}) => {
    const params = { ...paramsRef.current, ...overrides }
    paramsRef.current = params
    setLoading(true)
    try {
      const result = await request<CommentPage>('/admin/wonderland/comments', { params })
      setData(result.data)
    }
    catch {
      // request 统一展示错误。
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const search = () => void load({ pageIndex: 0, q, targetType, visibility })
  const reset = () => {
    setQ('')
    setTargetType('')
    setVisibility('')
    void load({ pageIndex: 0, q: '', targetType: '', visibility: '' })
  }
  const moderate = async (item: AdminComment) => {
    const action = item.visibility === 'visible' ? 'hide' : 'restore'
    if (reason.trim().length < 2) {
      toast.warning('请填写至少 2 个字的审核原因')
      return
    }
    setPending(item.id)
    try {
      await request(`/admin/wonderland/discussion/comment/${item.id}`, {
        body: JSON.stringify({ action, reason }),
        method: 'PATCH',
      })
      toast.success(action === 'hide' ? '评论已隐藏' : '评论已恢复')
      await load()
    }
    catch {
      // request 统一展示错误。
    }
    finally {
      setPending(null)
    }
  }

  return (
    <section className="admin-data-view">
      <AdminSectionHeader title="评论管理" description="统一管理问题、回答与文章评论；审核操作会保留记录。" />

      <AdminToolbar>
        <Input
          aria-label="搜索评论"
          variant="secondary"
          placeholder="评论内容、作者或所属内容"
          value={q}
          onChange={event => setQ(event.target.value)}
          className="min-w-[220px] flex-1 xl:max-w-[340px]"
        />
        <select aria-label="评论目标" value={targetType} onChange={event => setTargetType(event.target.value)} className="h-10 min-w-36 rounded-xl border border-border bg-surface-secondary px-3 text-xs outline-none focus:border-focus">
          <option value="">全部目标</option>
          <option value="question">问题评论</option>
          <option value="answer">回答评论</option>
          <option value="news">新闻评论</option>
        </select>
        <select aria-label="评论状态" value={visibility} onChange={event => setVisibility(event.target.value)} className="h-10 min-w-36 rounded-xl border border-border bg-surface-secondary px-3 text-xs outline-none focus:border-focus">
          <option value="">全部状态</option>
          <option value="visible">公开</option>
          <option value="hidden">已隐藏</option>
          <option value="deleted">已删除</option>
        </select>
        <Button size="sm" isPending={loading} onPress={search}>
          <Magnifier />
          查询
        </Button>
        <Button size="sm" variant="secondary" onPress={reset}>
          <ArrowRotateLeft />
          重置
        </Button>
        <TextArea
          aria-label="审核原因"
          variant="secondary"
          rows={1}
          value={reason}
          onChange={event => setReason(event.target.value)}
          className="min-w-[260px] flex-1 xl:ml-auto xl:max-w-[420px]"
        />
      </AdminToolbar>

      {loading && !data
        ? <div className="grid min-h-72 place-items-center"><Spinner /></div>
        : (
            <Table variant="secondary" className="mt-4">
              <Table.ScrollContainer>
                <Table.Content aria-label="妙妙屋评论列表" className="min-w-[920px]">
                  <Table.Header>
                    <Table.Column id="comment" isRowHeader>评论</Table.Column>
                    <Table.Column id="target">所属内容</Table.Column>
                    <Table.Column id="author">作者</Table.Column>
                    <Table.Column id="status">状态</Table.Column>
                    <Table.Column id="created">发布时间</Table.Column>
                    <Table.Column id="actions">操作</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <EmptyContent />}>
                    {items.map(item => (
                      <Table.Row key={item.id} id={item.id}>
                        <Table.Cell>
                          <div className="max-w-xl py-1">
                            <p className="line-clamp-3 text-sm leading-6">{markdownPlainText(item.body) || '图片评论'}</p>
                            {item.image_count
                              ? (
                                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted">
                                    <Picture className="size-3.5" />
                                    {item.image_count}
                                    {' '}
                                    张图片
                                  </span>
                                )
                              : null}
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="max-w-64">
                            <Chip size="sm" variant="soft">{targetLabel(item.target_type)}</Chip>
                            <Link href={targetHref(item)} target="_blank" className="mt-1.5 flex items-center gap-1 text-xs font-semibold hover:text-accent">
                              <span className="line-clamp-2">{item.target_title}</span>
                              <Eye className="size-3.5 shrink-0" />
                            </Link>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-xs">{item.author_name}</Table.Cell>
                        <Table.Cell><Chip color={item.visibility === 'visible' ? 'success' : 'warning'} size="sm" variant="soft">{visibilityLabel(item.visibility)}</Chip></Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-xs text-muted">{formatDate(item.created_at, 'datetime')}</Table.Cell>
                        <Table.Cell>
                          <Button size="sm" variant={item.visibility === 'visible' ? 'danger-soft' : 'secondary'} isDisabled={item.visibility === 'deleted' || Boolean(pending)} isPending={pending === item.id} onPress={() => void moderate(item)}>
                            {item.visibility === 'visible' ? '隐藏' : '恢复'}
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}

      <footer className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted">
          共
          {data?.total ?? 0}
          {' '}
          条 · 第
          {(data?.pageIndex ?? 0) + 1}
          /
          {pageCount}
          {' '}
          页
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" isDisabled={!data || data.pageIndex <= 0 || loading} onPress={() => void load({ pageIndex: (data?.pageIndex ?? 0) - 1 })}>上一页</Button>
          <Button size="sm" variant="secondary" isDisabled={!data || data.pageIndex >= pageCount - 1 || loading} onPress={() => void load({ pageIndex: (data?.pageIndex ?? 0) + 1 })}>下一页</Button>
        </div>
      </footer>
    </section>
  )
}

function targetHref(item: AdminComment) {
  return item.target_type === 'news' ? `/wonderland/news/${item.target_slug}#discussion` : `/wonderland/questions/${item.target_slug}`
}

function targetLabel(type: AdminComment['target_type']) {
  return { answer: '回答', news: '新闻', question: '问题' }[type]
}

function visibilityLabel(visibility: AdminComment['visibility']) {
  return { deleted: '已删除', hidden: '已隐藏', visible: '公开' }[visibility]
}

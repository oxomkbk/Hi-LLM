'use client'

import {
  Button,
  Chip,
  Spinner,
  Table,
  TextArea,
  toast,
} from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { request } from '@/lib/request'

import { AdminSectionHeader, AdminToolbar } from '../admin-ui'

interface AdminReport {
  created_at: string
  details: string
  id: string
  reason: string
  reporter_name: string
  resolution: string | null
  status: string
  target_id: string
  target_summary: string
  target_type: 'answer' | 'comment' | 'question'
}

interface AdminReportPage {
  list: AdminReport[]
  pageIndex: number
  pageSize: number
  total: number
}

const PAGE_SIZE = 20

export default function WonderlandReportManager() {
  const [data, setData] = useState<AdminReportPage | null>(null)
  const [status, setStatus] = useState('pending')
  const [resolution, setResolution] = useState('已核查用户举报与目标内容')
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestSequenceRef = useRef(0)
  const items = data?.list ?? []
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await request<AdminReportPage>('/admin/wonderland/reports', {
        params: { pageIndex, pageSize: PAGE_SIZE, status },
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
      setError(cause instanceof Error ? cause.message : '举报列表加载失败')
    }
    finally {
      if (requestId === requestSequenceRef.current)
        setLoading(false)
    }
  }, [pageIndex, status])

  useEffect(() => {
    void load()
    return () => {
      requestSequenceRef.current += 1
    }
  }, [load])

  const resolve = async (item: AdminReport, nextStatus: 'dismissed' | 'resolved') => {
    if (resolution.trim().length < 4) {
      toast.warning('请填写至少 4 个字的处理结论')
      return
    }
    setPending(item.id)
    try {
      await request(`/admin/wonderland/reports/${item.id}`, {
        body: JSON.stringify({ resolution: resolution.trim(), status: nextStatus }),
        method: 'PATCH',
      })
      toast.success('举报已处理')
      await load()
    }
    catch {
      // request 统一处理错误提示。
    }
    finally {
      setPending(null)
    }
  }

  return (
    <section className="admin-data-view">
      <AdminSectionHeader
        title="举报处理"
        actions={(
          <span data-tone="neutral" className="admin-ui-status">
            {data
              ? `共 ${data.total} 条举报`
              : '正在读取举报'}
          </span>
        )}
        description="处理社区举报并保留结论，便于后续复核。"
      />
      <AdminToolbar>
        <select
          aria-label="举报状态" value={status} onChange={(event) => {
            setPageIndex(0)
            setStatus(event.target.value)
          }} className="h-9 min-w-36 rounded-lg border border-border bg-surface px-3 text-xs"
        >
          <option value="pending">待处理</option>
          <option value="reviewing">处理中</option>
          <option value="resolved">已处理</option>
          <option value="dismissed">已驳回</option>
          <option value="">全部</option>
        </select>
        <TextArea
          aria-label="处理结论"
          variant="secondary"
          rows={1}
          value={resolution}
          onChange={event => setResolution(event.target.value)}
          className="min-w-[280px] flex-1 lg:max-w-[520px]"
        />
        <span className="admin-filter-hint">结论会写入审核记录，请说明核查结果</span>
      </AdminToolbar>
      {error
        ? (
            <div role="alert" className="admin-list-error">
              <strong>举报列表暂时不可用</strong>
              <span>{error}</span>
              <Button size="sm" variant="secondary" onPress={() => void load()}>重试</Button>
            </div>
          )
        : loading && !data
          ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
          : items.length
            ? (
                <Table variant="secondary" className="mt-3">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="社区举报列表" className="min-w-[840px]">
                      <Table.Header>
                        <Table.Column id="report" isRowHeader>举报内容</Table.Column>
                        <Table.Column id="target">目标内容</Table.Column>
                        <Table.Column id="reporter">举报人</Table.Column>
                        <Table.Column id="status">状态</Table.Column>
                        <Table.Column id="created">提交时间</Table.Column>
                        <Table.Column id="actions">处理</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {items.map(item => (
                          <Table.Row key={item.id} id={item.id}>
                            <Table.Cell>
                              <div className="max-w-sm py-1">
                                <strong className="text-sm">{reasonLabel(item.reason)}</strong>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.details || '举报人未补充说明'}</p>
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              <div className="max-w-md">
                                <Chip size="sm" variant="soft">{targetLabel(item.target_type)}</Chip>
                                <p className="mt-1.5 line-clamp-2 text-xs leading-5">{item.target_summary}</p>
                                {item.resolution
                                  ? (
                                      <p className="mt-1 line-clamp-1 text-[11px] text-muted">
                                        结论：
                                        {item.resolution}
                                      </p>
                                    )
                                  : null}
                              </div>
                            </Table.Cell>
                            <Table.Cell className="text-xs">{item.reporter_name}</Table.Cell>
                            <Table.Cell><Chip color={reportStatusTone(item.status)} size="sm" variant="soft">{reportStatusLabel(item.status)}</Chip></Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-xs text-muted">{new Date(item.created_at).toLocaleString('zh-CN')}</Table.Cell>
                            <Table.Cell>
                              {item.status === 'pending' || item.status === 'reviewing'
                                ? (
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="secondary" isDisabled={Boolean(pending)} onPress={() => void resolve(item, 'dismissed')}>驳回</Button>
                                      <Button size="sm" isDisabled={Boolean(pending)} isPending={pending === item.id} onPress={() => void resolve(item, 'resolved')}>完成</Button>
                                    </div>
                                  )
                                : <span className="text-xs text-muted">已结束</span>}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
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
    </section>
  )
}

function reasonLabel(reason: string) {
  return ({ abuse: '辱骂攻击', illegal: '违法内容', misinformation: '错误信息', other: '其他', privacy: '隐私泄露', spam: '广告垃圾' } as Record<string, string>)[reason] || reason
}
function reportStatusLabel(status: string) {
  return ({ dismissed: '已驳回', pending: '待处理', resolved: '已完成', reviewing: '处理中' } as Record<string, string>)[status] ?? status
}

function reportStatusTone(status: string): 'default' | 'success' | 'warning' {
  if (status === 'resolved')
    return 'success'
  if (status === 'pending' || status === 'reviewing')
    return 'warning'
  return 'default'
}

function targetLabel(type: AdminReport['target_type']) {
  return { answer: '回答', comment: '评论', question: '问题' }[type]
}

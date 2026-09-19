'use client'

import {
  ArrowRotateLeft,
  Check,
  CircleCheckFill,
  Code,
  Ellipsis,
  Magnifier,
  PencilToSquare,
  Plus,
  Server,
  StarFill,
  TrashBin,
} from '@gravity-ui/icons'
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  Spinner,
  Table,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import AdminListPagination from '../admin-list-pagination'
import { AdminSectionHeader, AdminToolbar } from '../admin-ui'
import { isCheckableGitSource } from '../security/source-check-model'
import SourceLinkStatus from '../security/source-link-status'
import { useSourceChecks } from '../security/use-source-checks'
import { mcpAdminListHref, mcpAdminRequestParams } from './list-model'

import type { McpAdminListFilters, McpAdminMode } from './list-model'
import type { SecuritySourceCheckResult } from '@/lib/ai-security/source-check-contract'
import type { Mcp, McpSubmission, PaginatingResponse } from '@/types'

const PAGE_SIZE = 20

export default function McpAdminWorkspace({ initialFilters, mode }: {
  initialFilters: McpAdminListFilters
  mode: McpAdminMode
}) {
  const router = useRouter()
  const [queryDraft, setQueryDraft] = useState({
    source: initialFilters.q,
    value: initialFilters.q,
  })
  const [data, setData] = useState<PaginatingResponse<Mcp | McpSubmission> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Mcp | null>(null)
  const [deleting, setDeleting] = useState(false)
  const sourceChecks = useSourceChecks()
  const requestIdRef = useRef(0)
  const confirmState = useOverlayState()
  const query = queryDraft.source === initialFilters.q ? queryDraft.value : initialFilters.q
  const listHref = mcpAdminListHref(mode, initialFilters)

  const load = useCallback(async (filters: McpAdminListFilters) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const payload = await request<PaginatingResponse<Mcp | McpSubmission>>(`/${mode === 'content' ? 'mcps' : 'mcp-submissions'}`, {
        params: mcpAdminRequestParams(filters, PAGE_SIZE),
      })

      if (requestId !== requestIdRef.current)
        return payload

      setData(payload.data)
      const normalizedPage = normalizeAdminPage(filters.pageIndex + 1, payload.data?.total ?? 0, PAGE_SIZE)
      if (normalizedPage !== filters.pageIndex + 1) {
        router.replace(mcpAdminListHref(mode, { ...filters, pageIndex: normalizedPage - 1 }), { scroll: false })
      }

      return payload
    }
    catch (reason) {
      if (requestId === requestIdRef.current)
        setError(reason instanceof Error ? reason.message : 'MCP 数据加载失败')
      throw reason
    }
    finally {
      if (requestId === requestIdRef.current)
        setLoading(false)
    }
  }, [mode, router])

  useEffect(() => {
    void load({
      pageIndex: initialFilters.pageIndex,
      q: initialFilters.q,
      status: initialFilters.status,
    }).catch(() => {})
  }, [initialFilters.pageIndex, initialFilters.q, initialFilters.status, load])

  const list = useMemo(() => data?.list ?? [], [data])
  const total = data?.total ?? 0

  const navigate = (filters: McpAdminListFilters) => {
    const href = mcpAdminListHref(mode, filters)
    if (href === listHref)
      void load(filters).catch(() => {})
    else
      router.replace(href, { scroll: false })
  }

  const search = () => {
    const nextQuery = query.trim().slice(0, 80)
    setQueryDraft({ source: nextQuery, value: nextQuery })
    navigate({ ...initialFilters, pageIndex: 0, q: nextQuery })
  }

  const reset = () => {
    const nextStatus = mode === 'content' ? 'all' : 'pending'
    setQueryDraft({ source: '', value: '' })
    navigate({ pageIndex: 0, q: '', status: nextStatus })
  }

  const openDelete = (item: Mcp) => {
    setSelected(item)
    confirmState.open()
  }

  const deleteItem = async () => {
    if (!selected)
      return

    setDeleting(true)
    try {
      await request(`/mcps/${selected.id}`, { method: 'DELETE' })
      toast.success('MCP Server 已删除')
      confirmState.close()
      setSelected(null)
      await load(initialFilters)
    }
    catch (reason) {
      toast.danger(reason instanceof Error ? reason.message : '删除失败')
    }
    finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="admin-flat-panel overflow-hidden">
        <Card.Header className="block p-0">
          <AdminSectionHeader
            title={mode === 'content' ? 'MCP' : 'MCP 投稿'}
            actions={(
              <>
                <span data-tone={loading && data ? 'info' : 'neutral'} className="admin-ui-status">
                  共
                  {' '}
                  {total}
                  {' '}
                  条
                  {loading && data ? ' · 更新中' : ''}
                </span>
                {mode === 'content'
                  ? (
                      <Button size="sm" onPress={() => router.push(buildContextualHref('/admin/mcp/new', listHref))}>
                        <Plus />
                        新增 MCP
                      </Button>
                    )
                  : null}
              </>
            )}
            description={mode === 'content' ? '管理服务信息、发布状态与连接配置' : '审核社区提交的 MCP 服务与安全评测结果'}
          />
          <AdminToolbar>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                search()
              }}
              className="admin-ui-toolbar__form"
            >
              <label className="relative min-w-[220px] flex-1 xl:max-w-[360px]">
                <span className="sr-only">搜索 MCP</span>
                <Magnifier className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  maxLength={80}
                  placeholder="名称、发布者、投稿人…"
                  value={query}
                  onChange={event => setQueryDraft({ source: initialFilters.q, value: event.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-surface-secondary pl-9 pr-3 text-xs outline-none focus:border-focus"
                />
              </label>
              <select
                aria-label="状态筛选"
                value={initialFilters.status}
                onChange={event => navigate({ ...initialFilters, pageIndex: 0, status: event.target.value })}
                className="h-10 min-w-36 rounded-xl border border-border bg-surface-secondary px-3 text-xs outline-none focus:border-focus"
              >
                <option value="all">全部状态</option>
                {mode === 'content'
                  ? (
                      <>
                        <option value="draft">草稿</option>
                        <option value="published">已发布</option>
                        <option value="archived">已归档</option>
                      </>
                    )
                  : (
                      <>
                        <option value="pending">待审核</option>
                        <option value="pending_security">安全评测中</option>
                        <option value="approved">已通过</option>
                        <option value="rejected">已拒绝</option>
                      </>
                    )}
              </select>
              <Button type="submit" size="sm" isPending={loading}>
                {loading ? <Spinner color="current" size="sm" /> : <Magnifier />}
                查询
              </Button>
              <Button type="button" size="sm" variant="secondary" isDisabled={loading} onPress={reset}>
                <ArrowRotateLeft />
                重置
              </Button>
            </form>
          </AdminToolbar>
        </Card.Header>

        <Card.Content className="p-0">
          {error
            ? (
                <div className="p-4">
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>MCP 数据加载失败</Alert.Title>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" variant="danger" onPress={() => void load(initialFilters).catch(() => {})}>重试</Button>
                  </Alert>
                </div>
              )
            : loading && !data
              ? <div className="grid min-h-72 place-items-center"><Spinner /></div>
              : (
                  <Table variant="secondary" className={loading ? 'opacity-70' : undefined}>
                    <Table.ScrollContainer>
                      <Table.Content aria-label={mode === 'content' ? 'MCP 管理列表' : 'MCP 投稿列表'} className="admin-mcp-table min-w-[1040px]">
                        <Table.Header>
                          <Table.Column id="mcp" isRowHeader className="admin-mcp-column admin-mcp-column--resource">MCP</Table.Column>
                          <Table.Column id="status" className="admin-mcp-column admin-mcp-column--status">状态</Table.Column>
                          <Table.Column id="publisher" className="admin-mcp-column admin-mcp-column--publisher">发布者</Table.Column>
                          <Table.Column id="connection" className="admin-mcp-column admin-mcp-column--connection">连接 / 评测</Table.Column>
                          <Table.Column id="updated" className="admin-mcp-column admin-mcp-column--updated">最后更新</Table.Column>
                          <Table.Column id="actions" className="admin-mcp-column admin-mcp-column--actions">操作</Table.Column>
                        </Table.Header>
                        <Table.Body renderEmptyState={() => <EmptyContent />}>
                          {list.map(item => (
                            <AdminMcpRow
                              key={item.id}
                              item={item}
                              mode={mode}
                              sourceChecking={sourceChecks.isChecking(mode === 'content' ? 'mcp' : 'mcp_submission', item.id)}
                              sourceCheckResult={sourceChecks.resultFor(mode === 'content' ? 'mcp' : 'mcp_submission', item.id)}
                              onCheckSource={() => void sourceChecks.check({
                                subjectId: item.id,
                                subjectType: mode === 'content' ? 'mcp' : 'mcp_submission',
                              })}
                              onDelete={() => openDelete(item as Mcp)}
                              onOpen={() => {
                                const destination = mode === 'content'
                                  ? `/admin/mcp/${item.id}/edit`
                                  : `/admin/mcp/submissions/${item.id}/review`
                                router.push(buildContextualHref(destination, listHref))
                              }}
                            />
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                )}
        </Card.Content>

        {total > 0
          ? (
              <Card.Footer className="border-t border-border px-4 py-3">
                <AdminListPagination
                  loading={loading}
                  page={initialFilters.pageIndex + 1}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPageChange={page => navigate({ ...initialFilters, pageIndex: page - 1 })}
                />
              </Card.Footer>
            )
          : null}
      </Card>
      <ConfirmDelete deleting={deleting} item={selected} state={confirmState} onConfirm={() => void deleteItem()} />
    </>
  )
}

function AdminMcpRow({ item, mode, onCheckSource, onDelete, onOpen, sourceCheckResult, sourceChecking }: {
  item: Mcp | McpSubmission
  mode: McpAdminMode
  onCheckSource: () => void
  onDelete: () => void
  onOpen: () => void
  sourceCheckResult: SecuritySourceCheckResult | null
  sourceChecking: boolean
}) {
  const transports = [...new Set(item.installations.map(installation => installation.transport))]
  const statusMeta = statusLabel(item.status)
  const submission = mode === 'submissions' ? item as McpSubmission : null
  const sourceCheckAvailable = isCheckableGitSource(item.source_url)

  return (
    <Table.Row id={item.id}>
      <Table.Cell>
        <div className="admin-resource-cell flex min-w-0 items-center gap-3 py-1">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-secondary text-foreground"><Server /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p title={item.name} className="max-w-80 truncate text-sm font-semibold">{item.name}</p>
              {'featured' in item && item.featured ? <StarFill aria-label="精选 MCP" className="size-3.5 shrink-0 text-warning" /> : null}
              {'verified' in item && item.verified ? <CircleCheckFill aria-label="认证 MCP" className="size-3.5 shrink-0 text-accent" /> : null}
              <span className="max-w-36 truncate font-mono text-[10px] text-muted">
                /
                {item.slug}
              </span>
            </div>
            <p title={item.summary} className="mt-0.5 max-w-[430px] truncate text-xs text-muted">{item.summary}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Chip size="sm" variant="secondary">{item.category}</Chip>
              {transports.slice(0, 2).map(value => <Chip key={value} size="sm" variant="soft">{value}</Chip>)}
              {transports.length > 2
                ? (
                    <span className="text-[11px] text-muted">
                      +
                      {transports.length - 2}
                    </span>
                  )
                : null}
            </div>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell><Chip color={statusMeta.color} size="sm" variant="soft">{statusMeta.label}</Chip></Table.Cell>
      <Table.Cell>
        <div className="min-w-0 text-xs">
          <p title={item.publisher_name} className="max-w-40 truncate font-semibold">{item.publisher_name}</p>
          <div className="mt-1 max-w-44">
            <SourceLinkStatus result={sourceCheckResult} sourceUrl={item.source_url} />
          </div>
          {submission
            ? (
                <p title={submission.submitter_name} className="mt-1 max-w-40 truncate text-muted">
                  投稿：
                  {submission.submitter_name}
                </p>
              )
            : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="text-xs text-muted">
          <p>
            {item.installations.length}
            {' '}
            种连接
          </p>
          {submission ? <p className="mt-1 font-semibold text-foreground">{securityStateLabel(submission)}</p> : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="whitespace-nowrap text-xs text-muted">
          <p>{formatDate(item.updated_at, 'datetime')}</p>
          {!submission
            ? (
                <p className="mt-0.5">
                  排序
                  {' '}
                  {(item as Mcp).sort}
                </p>
              )
            : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex items-center justify-end gap-1">
          {mode === 'submissions' && sourceCheckAvailable
            ? (
                <Button size="sm" variant="tertiary" isPending={sourceChecking} onPress={onCheckSource}>
                  <Code />
                  检查来源
                </Button>
              )
            : null}
          <Button size="sm" variant={mode === 'submissions' && (item.status === 'pending' || item.status === 'pending_security') ? 'primary' : 'secondary'} onPress={onOpen}>
            {mode === 'content' ? <PencilToSquare /> : <Check />}
            {mode === 'content' ? '编辑' : item.status === 'pending' || item.status === 'pending_security' ? '审核' : '查看'}
          </Button>
          {mode === 'content'
            ? (
                <Dropdown>
                  <Button aria-label={`更多操作：${item.name}`} size="sm" variant="tertiary" isIconOnly>
                    <Ellipsis aria-hidden="true" />
                  </Button>
                  <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                      aria-label={`${item.name} 行操作`}
                      disabledKeys={sourceChecking ? ['source-check'] : []}
                      onAction={(key) => {
                        if (key === 'source-check')
                          onCheckSource()
                        if (key === 'delete')
                          onDelete()
                      }}
                    >
                      {sourceCheckAvailable
                        ? (
                            <Dropdown.Item id="source-check" textValue="检查来源">
                              <Code aria-hidden="true" className="size-4 text-muted" />
                              <Label>{sourceChecking ? '检查中' : '检查来源'}</Label>
                            </Dropdown.Item>
                          )
                        : null}
                      <Dropdown.Item id="delete" variant="danger" textValue="删除">
                        <TrashBin aria-hidden="true" className="size-4 text-danger" />
                        <Label>删除</Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              )
            : null}
        </div>
      </Table.Cell>
    </Table.Row>
  )
}

function ConfirmDelete({ deleting, item, onConfirm, state }: {
  deleting: boolean
  item: Mcp | null
  onConfirm: () => void
  state: ReturnType<typeof useOverlayState>
}) {
  return (
    <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-md">
          <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={state.close} />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>删除 MCP Server？</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-sm text-muted">
              {item?.name}
              ，删除后无法恢复。
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="secondary" isDisabled={deleting} slot="close" onPress={state.close}>取消</Button>
            <Button variant="danger" isPending={deleting} onPress={onConfirm}>确认删除</Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}

function securityStateLabel(submission: McpSubmission) {
  if (submission.security_scan_status === 'queued')
    return '材料已进入处理队列'
  if (submission.security_scan_status === 'preparing' || submission.security_scan_status === 'running')
    return '正在整理当前依据'
  return ({
    blocked: '危险项待处理',
    failed: '当前依据待补充',
    passed: '已覆盖材料未命中规则',
    review_required: '有改进建议',
    stale: '参考资料更新中',
    unassessed: '当前依据待补充',
  } as Record<string, string>)[submission.security_report_state ?? 'unassessed']
}

function statusLabel(status: string): { color: 'accent' | 'danger' | 'success' | 'warning', label: string } {
  if (status === 'published' || status === 'approved')
    return { color: 'success', label: status === 'published' ? '已发布' : '已通过' }
  if (status === 'rejected' || status === 'archived')
    return { color: 'danger', label: status === 'rejected' ? '已拒绝' : '已归档' }
  if (status === 'pending_security')
    return { color: 'accent', label: '安全评测中' }
  return { color: 'warning', label: status === 'pending' ? '待审核' : '草稿' }
}

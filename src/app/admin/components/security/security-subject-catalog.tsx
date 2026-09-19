'use client'

import {
  ArrowRotateLeft,
  CircleStop,
  Eye,
  Magnifier,
  Play,
  ShieldExclamation,
  Xmark,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Chip,
  ListBox,
  SearchField,
  Select,
  Spinner,
  Table,
  toast,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { ApiRequestError, request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import SecurityAssessmentProgress from './security-assessment-progress'
import SecurityServiceControl from './security-service-control'
import SecurityStatusCell from './security-status-cell'

import type { SecurityCapabilities } from '@/lib/ai-security/capabilities'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

export interface SecuritySubjectCatalogData {
  capabilities: SecurityCapabilities
  list: SecuritySubjectCatalogItem[]
  page: number
  pageSize: number
  runtime: SecurityWorkerRuntime
  summary: {
    active: number
    blocked: number
    failed: number
    needsAssessment: number
    passed: number
    reviewRequired: number
    reviewResolved: number
    total: number
  }
  total: number
}

export interface SecuritySubjectListFilters {
  contentStatus: string
  pageIndex: number
  q: string
  reportState: string
  scope: 'active' | 'ignored'
  subjectType: string
}

interface SecuritySubjectCatalogItem {
  activeCreatedAt: null | string
  activeAssessmentId: null | string
  activeNextRunAt: null | string
  activeStartedAt: null | string
  activeWorkerId: null | string
  adapterAvailable: boolean
  contentStatus: string
  grade: null | string
  historicalGrade: null | string
  historicalScore: null | number
  id: string
  ignoredAt: null | string
  ignoreReason: null | string
  latestAssessmentId: null | string
  latestAttemptId: null | string
  latestAttemptNumber: null | number
  latestAttemptStatus: null | string
  mode: string
  maxAttempts: number
  name: string
  reportState: string
  reviewResolved: boolean
  riskCounts: { critical: number, high: number, info: number, low: number, medium: number }
  scanStatus: null | string
  score: null | number
  slug: null | string
  subjectType: string
  updatedAt: string
}

const CONTENT_STATUS_OPTIONS = [
  { label: '已发布', value: 'published' },
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'pending' },
  { label: '待安全审核', value: 'pending_security' },
  { label: '已归档', value: 'archived' },
  { label: '已拒绝投稿', value: 'rejected' },
]

const CATALOG_SCOPE_OPTIONS = [
  { label: '当前内容', value: 'active' },
  { label: '已忽略', value: 'ignored' },
]

const REPORT_STATE_OPTIONS = [
  { label: '当前依据待补充', value: 'unassessed' },
  { label: '已覆盖材料未命中规则', value: 'passed' },
  { label: '历史建议项', value: 'review_required' },
  { label: '危险项待处理', value: 'blocked' },
  { label: '材料处理未完成', value: 'failed' },
  { label: '参考资料更新中', value: 'stale' },
]

const SUBJECT_OPTIONS = [
  { label: 'Skills', value: 'skill' },
  { label: 'Skill 投稿', value: 'skill_submission' },
  { label: 'MCP', value: 'mcp' },
  { label: 'MCP 投稿', value: 'mcp_submission' },
  { label: 'Prompts', value: 'prompt' },
]

export default function SecuritySubjectCatalog({ initialData, initialFilters, onRuntimeChange }: {
  initialData: SecuritySubjectCatalogData
  initialFilters: SecuritySubjectListFilters
  onRuntimeChange?: (runtime: SecurityWorkerRuntime) => void
}) {
  const router = useRouter()
  const [contentStatus, setContentStatus] = useState(initialFilters.contentStatus)
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pageIndex, setPageIndex] = useState(initialFilters.pageIndex)
  const [pendingId, setPendingId] = useState('')
  const [q, setQ] = useState(initialFilters.q)
  const [reportState, setReportState] = useState(initialFilters.reportState)
  const [scope, setScope] = useState(initialFilters.scope)
  const [subjectType, setSubjectType] = useState(initialFilters.subjectType)

  const load = useCallback(async (background = false) => {
    if (!background)
      setLoading(true)
    setError(false)
    try {
      const result = await request<SecuritySubjectCatalogData>('/admin/security-subjects', {
        params: {
          contentStatus: contentStatus === 'all' ? '' : contentStatus,
          pageIndex,
          pageSize: 20,
          q,
          reportState: reportState === 'all' ? '' : reportState,
          scope,
          subjectType: subjectType === 'all' ? '' : subjectType,
        },
      })
      setData(result.data)
      onRuntimeChange?.(result.data.runtime)
    }
    catch {
      setError(true)
    }
    finally {
      if (!background)
        setLoading(false)
    }
  }, [contentStatus, onRuntimeChange, pageIndex, q, reportState, scope, subjectType])

  useEffect(() => {
    if (pageIndex === initialFilters.pageIndex && q === initialFilters.q && contentStatus === initialFilters.contentStatus && reportState === initialFilters.reportState && scope === initialFilters.scope && subjectType === initialFilters.subjectType)
      return
    void load()
  }, [contentStatus, initialFilters, load, pageIndex, q, reportState, scope, subjectType])

  useEffect(() => {
    replaceSecuritySubjectUrl(securitySubjectListHref({ contentStatus, pageIndex, q, reportState, scope: scope as 'active' | 'ignored', subjectType }))
  }, [contentStatus, pageIndex, q, reportState, scope, subjectType])

  const hasActive = data.list.some(item => item.activeAssessmentId)
  useEffect(() => {
    if (!hasActive && data.runtime.status === 'ready')
      return
    const timer = window.setInterval(() => void load(true), hasActive ? 8000 : 15000)
    return () => window.clearInterval(timer)
  }, [data.runtime.status, hasActive, load])

  const summary = useMemo(() => [
    { label: '全部内容', tone: 'muted', value: data.summary.total },
    { label: '资料待补充 / 更新', tone: 'muted', value: data.summary.needsAssessment },
    { label: '处理中', tone: 'active', value: data.summary.active },
    { label: '已覆盖材料未命中规则', tone: 'passed', value: data.summary.passed },
    { label: '危险项待处理', tone: 'blocked', value: data.summary.blocked },
    { label: '资料自动补充中', tone: 'muted', value: data.summary.failed },
  ], [data.summary])

  const act = async (item: SecuritySubjectCatalogItem) => {
    const subjectKey = `${item.subjectType}:${item.id}`
    if (item.activeAssessmentId) {
      setPendingId(subjectKey)
      try {
        await request(`/admin/security-assessments/${item.activeAssessmentId}/cancel`, { body: '{}', method: 'POST' })
        toast.success('已提交取消请求')
        await load(true)
      }
      catch {
        // request() 已展示服务端稳定错误信息。
      }
      finally {
        setPendingId('')
      }
      return
    }
    if (!data.runtime.serviceEnabled) {
      toast.warning('评测服务已暂停，请先使用上方开关开启')
      return
    }
    if (item.mode === 'off') {
      openSecuritySettings()
      toast.warning(`请先启用 ${subjectLabel(item.subjectType)} 安全评测模式`)
      return
    }
    if (!item.adapterAvailable) {
      toast.warning(`${subjectLabel(item.subjectType)} 评测适配器尚未就绪`)
      return
    }
    if (data.runtime.status === 'starting') {
      toast.warning('执行节点正在确认配置，请稍后再试')
      return
    }
    if (data.runtime.status === 'offline') {
      toast.warning('评测服务已开启，但执行节点离线')
      return
    }
    if (!runtimeCanHandle(data.runtime, item.subjectType)) {
      toast.warning(`${subjectLabel(item.subjectType)} 扫描能力暂不可用，请查看上方运行状态`)
      return
    }
    setPendingId(subjectKey)
    try {
      if (item.latestAttemptId && item.latestAttemptStatus === 'failed'
        && (item.latestAttemptNumber ?? 0) < item.maxAttempts) {
        await request(`/admin/security-assessments/${item.latestAttemptId}/retry`, { body: '{}', method: 'POST' })
        toast.success('资料补充任务已重新处理')
      }
      else {
        const force = Boolean(item.latestAssessmentId)
        await request('/admin/security-assessments', {
          body: JSON.stringify({
            force,
            requestId: force ? crypto.randomUUID() : undefined,
            subjectId: item.id,
            subjectType: item.subjectType,
          }),
          method: 'POST',
        })
        toast.success(force ? '重新评测已加入队列' : '安全评测已加入队列')
      }
      setPageIndex(0)
      await load(true)
    }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'SECURITY_SERVICE_DISABLED')
        await load(true)
      // request() 已展示服务端稳定错误信息；在此消费异常，避免未捕获 Promise。
    }
    finally {
      setPendingId('')
    }
  }

  const setIgnored = async (item: SecuritySubjectCatalogItem, ignored: boolean) => {
    const subjectKey = `${item.subjectType}:${item.id}`
    setPendingId(subjectKey)
    try {
      await request(`/admin/security-subjects/${item.subjectType}/${item.id}/ignore`, {
        body: JSON.stringify({ ignored }),
        method: 'POST',
      })
      toast.success(ignored ? '已从评测目录忽略，内容和报告均已保留' : '已恢复到评测目录')
      await load(true)
    }
    catch {
      // request() 已展示服务端错误信息。
    }
    finally {
      setPendingId('')
    }
  }

  return (
    <>
      <section aria-label="可评测内容摘要" className="security-summary-strip security-subject-summary">
        {summary.map(item => (
          <div key={item.label} data-tone={item.tone}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <SecurityServiceControl
        canManage={data.capabilities.canManageSettings}
        runtime={data.runtime}
        onRefresh={() => load(true)}
        onRuntimeChange={(runtime) => {
          setData(current => ({ ...current, runtime }))
          onRuntimeChange?.(runtime)
        }}
      />

      <Card className="security-ledger">
        <Card.Header className="security-ledger-toolbar">
          <div>
            <h3>可评测内容</h3>
            <p>所有 Skills、MCP、Prompts 与投稿都在这里开始评测，无需先创建任务。</p>
          </div>
          <div className="security-filters security-subject-filters">
            <SearchField aria-label="搜索内容" variant="secondary" value={q} onChange={setQ}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="名称或访问地址" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <CatalogFilter label="全部类型" options={SUBJECT_OPTIONS} value={subjectType} onChange={value => resetPage(setSubjectType, value, setPageIndex)} />
            <CatalogFilter
              label="全部范围"
              options={CATALOG_SCOPE_OPTIONS}
              value={scope}
              onChange={(value) => {
                if (value === 'active' || value === 'ignored') {
                  setScope(value)
                  setPageIndex(0)
                }
              }}
            />
            <CatalogFilter label="全部内容状态" options={CONTENT_STATUS_OPTIONS} value={contentStatus} onChange={value => resetPage(setContentStatus, value, setPageIndex)} />
            <CatalogFilter label="全部评测结论" options={REPORT_STATE_OPTIONS} value={reportState} onChange={value => resetPage(setReportState, value, setPageIndex)} />
            <Button
              aria-label="刷新内容目录"
              size="sm"
              variant="secondary"
              isIconOnly
              isPending={loading}
              onPress={() => void load()}
            >
              {loading ? <Spinner color="current" size="sm" /> : <Magnifier />}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => {
                setContentStatus('all')
                setPageIndex(0)
                setQ('')
                setReportState('all')
                setScope('active')
                setSubjectType('all')
              }}
            >
              <ArrowRotateLeft />
              重置
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="p-0">
          {error
            ? (
                <div className="p-4">
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>内容目录暂时无法载入</Alert.Title>
                      <Alert.Description>请稍后重试；现有内容和已生成报告不会受影响。</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" onPress={() => void load()}>重试</Button>
                  </Alert>
                </div>
              )
            : data.list.length === 0
              ? <EmptyContent />
              : (
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content aria-label="内容安全评测目录" className="min-w-[1080px]">
                        <Table.Header>
                          <Table.Column id="subject" isRowHeader>内容对象</Table.Column>
                          <Table.Column id="content">内容状态</Table.Column>
                          <Table.Column id="security">安全结论</Table.Column>
                          <Table.Column id="risks">风险分布</Table.Column>
                          <Table.Column id="updated">最后更新</Table.Column>
                          <Table.Column id="actions">操作</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {data.list.map(item => (
                            <Table.Row key={`${item.subjectType}:${item.id}`} id={`${item.subjectType}:${item.id}`}>
                              <Table.Cell>
                                <div className="max-w-72">
                                  <div className="flex items-center gap-2">
                                    <SubjectMark type={item.subjectType} />
                                    <strong className="truncate text-sm">{item.name}</strong>
                                  </div>
                                  <p className="mt-1 truncate font-mono text-[10px] text-muted">{item.slug ?? item.id}</p>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <Chip size="sm" variant="secondary">{contentStatusLabel(item.contentStatus)}</Chip>
                                {item.ignoredAt ? <Chip color="warning" size="sm" variant="soft">已忽略</Chip> : null}
                                <p className="mt-1 text-[10px] text-muted">{subjectLabel(item.subjectType)}</p>
                              </Table.Cell>
                              <Table.Cell>
                                <SecurityStatusCell
                                  grade={item.grade}
                                  hideScore={Boolean(item.latestAssessmentId)}
                                  historicalGrade={item.historicalGrade}
                                  historicalScore={item.historicalScore}
                                  reportState={item.reportState}
                                  reviewResolved={item.reviewResolved}
                                  scanStatus={item.scanStatus}
                                  score={item.score}
                                />
                                {item.activeAssessmentId && item.activeCreatedAt && item.scanStatus
                                  ? (
                                      <SecurityAssessmentProgress
                                        createdAt={item.activeCreatedAt}
                                        nextRunAt={item.activeNextRunAt}
                                        runtime={data.runtime}
                                        startedAt={item.activeStartedAt}
                                        status={item.scanStatus}
                                        subjectType={item.subjectType}
                                        workerId={item.activeWorkerId}
                                      />
                                    )
                                  : null}
                              </Table.Cell>
                              <Table.Cell><CatalogRiskCounts item={item} /></Table.Cell>
                              <Table.Cell>
                                <p className="whitespace-nowrap text-xs">{formatDate(item.updatedAt, 'datetime')}</p>
                                <p className="mt-1 text-[10px] text-muted">{modeLabel(item.mode)}</p>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="security-subject-actions">
                                  {item.latestAssessmentId || item.latestAttemptId
                                    ? (
                                        <Button
                                          aria-label="查看最近评测"
                                          size="sm"
                                          variant="secondary"
                                          isIconOnly
                                          onPress={() => router.push(buildContextualHref(
                                            `/admin/security/${item.latestAssessmentId ?? item.latestAttemptId}`,
                                            securitySubjectListHref({ contentStatus, pageIndex, q, reportState, scope: scope as 'active' | 'ignored', subjectType }),
                                          ))}
                                        >
                                          <Eye />
                                        </Button>
                                      )
                                    : null}
                                  {item.ignoredAt
                                    ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          isPending={pendingId === `${item.subjectType}:${item.id}`}
                                          onPress={() => void setIgnored(item, false)}
                                        >
                                          <ArrowRotateLeft />
                                          恢复评测
                                        </Button>
                                      )
                                    : (
                                        <>
                                          <Button
                                            size="sm"
                                            variant={!data.runtime.serviceEnabled || item.mode === 'off' || !item.adapterAvailable ? 'secondary' : 'primary'}
                                            isDisabled={item.activeAssessmentId
                                              ? !data.capabilities.canCancelAssessments
                                              : !data.capabilities.canStartAssessments || !data.runtime.serviceEnabled}
                                            isPending={pendingId === `${item.subjectType}:${item.id}`}
                                            onPress={() => void act(item)}
                                          >
                                            {item.activeAssessmentId
                                              ? <CircleStop />
                                              : item.mode === 'off' || !item.adapterAvailable ? <ShieldExclamation /> : <Play />}
                                            {actionLabel(item, data.runtime.serviceEnabled)}
                                          </Button>
                                          <Button
                                            aria-label={`忽略 ${item.name}`}
                                            size="sm"
                                            variant="tertiary"
                                            isDisabled={pendingId === `${item.subjectType}:${item.id}`}
                                            isIconOnly
                                            onPress={() => void setIgnored(item, true)}
                                          >
                                            <Xmark />
                                          </Button>
                                        </>
                                      )}
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                )}
        </Card.Content>
        <Card.Footer className="security-ledger-footer">
          <span>
            第
            {data.page}
            {' '}
            页 · 共
            {data.total}
            {' '}
            条内容
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" isDisabled={pageIndex === 0} onPress={() => setPageIndex(value => Math.max(0, value - 1))}>上一页</Button>
            <Button size="sm" variant="secondary" isDisabled={(pageIndex + 1) * data.pageSize >= data.total} onPress={() => setPageIndex(value => value + 1)}>下一页</Button>
          </div>
        </Card.Footer>
      </Card>
    </>
  )
}

function actionLabel(item: SecuritySubjectCatalogItem, serviceEnabled: boolean) {
  if (item.activeAssessmentId)
    return '取消评测'
  if (!serviceEnabled)
    return '服务已暂停'
  if (item.mode === 'off')
    return '先启用评测'
  if (!item.adapterAvailable)
    return '适配器未就绪'
  if (item.latestAttemptId && item.latestAttemptStatus === 'failed'
    && (item.latestAttemptNumber ?? 0) < item.maxAttempts) {
    return '重新整理资料'
  }
  if (item.latestAttemptId && item.latestAttemptStatus === 'failed')
    return '重新整理资料'
  return item.latestAssessmentId ? '重新评测' : '开始评测'
}

function CatalogFilter({ label, onChange, options, value }: { label: string, onChange: (value: string) => void, options: Array<{ label: string, value: string }>, value: string }) {
  return (
    <Select aria-label={label} variant="secondary" value={value} onChange={key => onChange(String(key))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="all" textValue={label}>
            {label}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {options.map(option => (
            <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function CatalogRiskCounts({ item }: { item: SecuritySubjectCatalogItem }) {
  const values = [
    ['C', item.riskCounts.critical, 'critical'],
    ['H', item.riskCounts.high, 'high'],
    ['M', item.riskCounts.medium, 'medium'],
    ['L', item.riskCounts.low, 'low'],
  ] as const
  return (
    <div className="security-risk-counts">
      {values.map(([label, value, tone]) => (
        <span key={tone} data-tone={tone}>
          <i>{label}</i>
          {value}
        </span>
      ))}
    </div>
  )
}

function contentStatusLabel(status: string) {
  return ({
    approved: '投稿已通过',
    archived: '已归档',
    draft: '草稿',
    pending: '待审核',
    pending_security: '待安全审核',
    published: '已发布',
    rejected: '已拒绝',
  } as Record<string, string>)[status] ?? status
}

function modeLabel(mode: string) {
  return ({ enforce: '自动保护发布', observe: '只生成报告', off: '自动评测已关闭', warn: '危险项仅提醒' } as Record<string, string>)[mode] ?? mode
}

function openSecuritySettings() {
  const drawer = document.querySelector<HTMLDetailsElement>('.security-settings-drawer')
  if (!drawer)
    return
  drawer.open = true
  drawer.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function replaceSecuritySubjectUrl(href: string) {
  window.history.replaceState(window.history.state, '', href)
}

function resetPage(setter: (value: string) => void, value: string, setPageIndex: (value: number) => void) {
  setPageIndex(0)
  setter(value)
}

function runtimeCanHandle(runtime: SecurityWorkerRuntime, subjectType: string) {
  const publicType = subjectType.startsWith('skill') ? 'skill' : subjectType.startsWith('mcp') ? 'mcp' : 'prompt'
  return runtime.readySubjectTypes.includes(publicType)
}

function securitySubjectListHref(filters: SecuritySubjectListFilters) {
  const params = new URLSearchParams()
  if (filters.q.trim())
    params.set('q', filters.q.trim())
  if (filters.subjectType !== 'all')
    params.set('type', filters.subjectType)
  if (filters.scope !== 'active')
    params.set('scope', filters.scope)
  if (filters.contentStatus !== 'all')
    params.set('contentStatus', filters.contentStatus)
  if (filters.reportState !== 'all')
    params.set('reportState', filters.reportState)
  if (filters.pageIndex > 0)
    params.set('page', String(filters.pageIndex + 1))
  return params.size ? `/admin/security?${params}` : '/admin/security'
}

function subjectLabel(type: string) {
  return ({
    mcp: 'MCP',
    mcp_submission: 'MCP 投稿',
    prompt: 'Prompt',
    skill: 'Skill',
    skill_submission: 'Skill 投稿',
  } as Record<string, string>)[type] ?? type
}

function SubjectMark({ type }: { type: string }) {
  const value = type.startsWith('skill') ? 'SK' : type.startsWith('mcp') ? 'MC' : 'PR'
  return <span className="security-subject-mark">{value}</span>
}

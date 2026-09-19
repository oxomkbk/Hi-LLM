'use client'

import {
  ArrowRotateLeft,
  CircleStop,
  Eye,
  Magnifier,
  ShieldExclamation,
  TrashBin,
} from '@gravity-ui/icons'
import {
  Alert,
  AlertDialog,
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
import { securityQualityScoreLabel } from '@/lib/ai-security/presentation'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { ApiRequestError, request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import { AdminPageHeader } from '../admin-ui'
import SecurityAssessmentProgress from './security-assessment-progress'
import SecuritySettingsPanel from './security-settings-panel'
import SecurityStatusCell from './security-status-cell'
import SecuritySubjectCatalog from './security-subject-catalog'

import type { SecuritySubjectCatalogData, SecuritySubjectListFilters } from './security-subject-catalog'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

export interface SecurityAssessmentListData {
  list: SecurityAssessmentListItem[]
  page: number
  pageSize: number
  runtime: SecurityWorkerRuntime
  summary: {
    active: number
    blocked: number
    failed: number
    passed: number
    reviewRequired: number
    unassessed: number
  }
  total: number
}

export interface SecurityAssessmentListItem {
  attempt_number: number
  batch_id: string | null
  coverage: { label?: string, level?: string } | null
  created_at: string
  finished_at: string | null
  evaluation_method: string | null
  execution_profile: 'configured' | 'local_deterministic'
  grade: string | null
  id: string
  next_run_at: string
  original_critical_count: number
  original_high_count: number
  original_info_count: number
  original_low_count: number
  original_medium_count: number
  original_score: number | null
  quality_rating: string | null
  quality_score: number | null
  report_state: string | null
  source_revision: string | null
  started_at: string | null
  status: string
  subject_id: string
  subject_name_snapshot: string
  subject_slug_snapshot: string | null
  subject_type: string
  trigger: string
  worker_id: string | null
}

const SUBJECT_OPTIONS = [
  { label: 'Skills', value: 'skill' },
  { label: 'Skill 投稿', value: 'skill_submission' },
  { label: 'MCP', value: 'mcp' },
  { label: 'MCP 投稿', value: 'mcp_submission' },
  { label: 'Prompts', value: 'prompt' },
]

const STATUS_OPTIONS = [
  { label: '排队中', value: 'queued' },
  { label: '准备中', value: 'preparing' },
  { label: '扫描中', value: 'running' },
  { label: '已完成', value: 'completed' },
  { label: '资料处理未完成', value: 'failed' },
  { label: '已停止', value: 'cancelled' },
]

interface SecurityAssessmentListFilters {
  pageIndex: number
  q: string
  status: string
  subjectType: string
}

export default function SecurityConsole({ initialAssessmentFilters, initialData, initialSubjectFilters, initialSubjects, initialView }: {
  initialAssessmentFilters: SecurityAssessmentListFilters
  initialData: SecurityAssessmentListData
  initialSubjectFilters: SecuritySubjectListFilters
  initialSubjects: SecuritySubjectCatalogData
  initialView: 'assessments' | 'subjects'
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [pageIndex, setPageIndex] = useState(initialAssessmentFilters.pageIndex)
  const [q, setQ] = useState(initialAssessmentFilters.q)
  const [status, setStatus] = useState(initialAssessmentFilters.status)
  const [subjectType, setSubjectType] = useState(initialAssessmentFilters.subjectType)
  const [pendingId, setPendingId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SecurityAssessmentListItem | null>(null)
  const [view, setView] = useState<'assessments' | 'subjects'>(initialView)

  const load = useCallback(async (background = false) => {
    if (!background)
      setLoading(true)
    setError(false)
    try {
      const result = await request<SecurityAssessmentListData>('/admin/security-assessments', {
        params: {
          pageIndex,
          pageSize: 20,
          q,
          status: status === 'all' ? '' : status,
          subjectType: subjectType === 'all' ? '' : subjectType,
        },
      })
      setData(result.data)
    }
    catch {
      setError(true)
    }
    finally {
      if (!background)
        setLoading(false)
    }
  }, [pageIndex, q, status, subjectType])

  useEffect(() => {
    if (pageIndex === initialAssessmentFilters.pageIndex && q === initialAssessmentFilters.q && status === initialAssessmentFilters.status && subjectType === initialAssessmentFilters.subjectType)
      return
    void load()
  }, [initialAssessmentFilters, load, pageIndex, q, status, subjectType])

  useEffect(() => {
    if (view !== 'assessments')
      return
    replaceAdminSecurityUrl(assessmentListHref({ pageIndex, q, status, subjectType }))
  }, [pageIndex, q, status, subjectType, view])

  const hasActive = data.list.some(item => ['queued', 'preparing', 'running'].includes(item.status))
  useEffect(() => {
    if (!hasActive)
      return
    const timer = window.setInterval(() => void load(true), 8000)
    return () => window.clearInterval(timer)
  }, [hasActive, load])

  const summary = useMemo(() => [
    { label: '处理中', tone: 'active', value: data.summary.active },
    { label: '规则未命中', tone: 'passed', value: data.summary.passed },
    { label: '历史建议项', tone: 'review', value: data.summary.reviewRequired },
    { label: '危险项待处理', tone: 'blocked', value: data.summary.blocked },
    { label: '资料待补充', tone: 'muted', value: data.summary.failed },
    { label: '未形成当前报告', tone: 'muted', value: data.summary.unassessed },
  ], [data.summary])

  const handleRuntimeChange = useCallback((runtime: SecurityWorkerRuntime) => {
    setData(current => ({ ...current, runtime }))
  }, [])

  const act = async (item: SecurityAssessmentListItem) => {
    const active = ['queued', 'preparing', 'running'].includes(item.status)
    if (!active && !data.runtime.serviceEnabled) {
      toast.warning('评测服务已暂停，请在“内容对象”页面开启后再重试')
      return
    }
    setPendingId(item.id)
    try {
      if (active) {
        await request(`/admin/security-assessments/${item.id}/cancel`, { body: '{}', method: 'POST' })
        toast.success('已提交取消请求')
      }
      else if (item.status === 'failed' || item.status === 'cancelled') {
        await request(`/admin/security-assessments/${item.id}/retry`, { body: '{}', method: 'POST' })
        toast.success('任务已重新入队')
      }
      else {
        await request('/admin/security-assessments', {
          body: JSON.stringify({
            force: true,
            requestId: crypto.randomUUID(),
            subjectId: item.subject_id,
            subjectType: item.subject_type,
          }),
          method: 'POST',
        })
        toast.success('重新扫描已加入队列')
      }
      await load(true)
    }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'SECURITY_SERVICE_DISABLED')
        await load(true)
      // request() 已展示错误；消费异常避免事件处理产生未捕获 Promise。
    }
    finally {
      setPendingId('')
    }
  }

  const remove = async () => {
    if (!deleteTarget)
      return
    setPendingId(deleteTarget.id)
    try {
      await request(`/admin/security-assessments/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('评测报告已删除，原始内容保持不变')
      setDeleteTarget(null)
      await load(true)
    }
    finally {
      setPendingId('')
    }
  }

  return (
    <div className="security-admin-workspace">
      <AdminPageHeader
        title="统一安全评测中心"
        actions={<Chip color="success" size="sm" variant="soft">仅危险项暂停发布</Chip>}
        description="Skills、MCP 与 Prompts 共用自动评测、危险项处置与前台评分。"
        eyebrow="自动评测与风险处置"
        className="security-admin-header"
      />

      <nav aria-label="安全评测工作区" className="security-view-switcher">
        <Button size="sm" variant={view === 'subjects' ? 'primary' : 'secondary'} onPress={() => setView('subjects')}>内容对象</Button>
        <Button size="sm" variant={view === 'assessments' ? 'primary' : 'secondary'} onPress={() => setView('assessments')}>任务历史</Button>
        <span>内容对象用于日常操作；任务历史只保留执行记录和故障排查。</span>
      </nav>

      {view === 'subjects'
        ? (
            <SecuritySubjectCatalog
              initialData={{ ...initialSubjects, runtime: data.runtime }}
              initialFilters={initialSubjectFilters}
              onRuntimeChange={handleRuntimeChange}
            />
          )
        : (
            <>
              <section aria-label="安全评测摘要" className="security-summary-strip">
                {summary.map(item => (
                  <div key={item.label} data-tone={item.tone}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </section>

              <Card className="security-ledger">
                <Card.Header className="security-ledger-toolbar">
                  <div>
                    <h3>评测台账</h3>
                    <p>
                      共
                      {data.total}
                      {' '}
                      条任务，运行中的任务每 8 秒自动更新。
                    </p>
                  </div>
                  <div className="security-filters">
                    <SearchField aria-label="搜索评测主体" variant="secondary" value={q} onChange={setQ}>
                      <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="名称或访问地址" />
                        <SearchField.ClearButton />
                      </SearchField.Group>
                    </SearchField>
                    <FilterSelect
                      label="全部主体"
                      options={SUBJECT_OPTIONS}
                      value={subjectType}
                      onChange={(value) => {
                        setPageIndex(0)
                        setSubjectType(value)
                      }}
                    />
                    <FilterSelect
                      label="全部任务状态"
                      options={STATUS_OPTIONS}
                      value={status}
                      onChange={(value) => {
                        setPageIndex(0)
                        setStatus(value)
                      }}
                    />
                    <Button
                      aria-label="刷新评测列表"
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
                        setPageIndex(0)
                        setQ('')
                        setStatus('all')
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
                              <Alert.Title>评测台账暂时无法载入</Alert.Title>
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
                              <Table.Content aria-label="内容安全评测台账" className="min-w-[1040px]">
                                <Table.Header>
                                  <Table.Column id="subject" isRowHeader>评测主体</Table.Column>
                                  <Table.Column id="result">当前结论</Table.Column>
                                  <Table.Column id="risks">风险分布</Table.Column>
                                  <Table.Column id="coverage">覆盖范围</Table.Column>
                                  <Table.Column id="time">任务时间</Table.Column>
                                  <Table.Column id="actions">操作</Table.Column>
                                </Table.Header>
                                <Table.Body>
                                  {data.list.map(item => (
                                    <Table.Row key={item.id} id={item.id}>
                                      <Table.Cell>
                                        <div className="max-w-72">
                                          <div className="flex items-center gap-2">
                                            <SubjectMark type={item.subject_type} />
                                            <strong className="truncate text-sm">{item.subject_name_snapshot}</strong>
                                          </div>
                                          <p className="mt-1 truncate font-mono text-[10px] text-muted">{item.subject_slug_snapshot ?? item.subject_id}</p>
                                          <p className="mt-1 text-[10px] text-muted">
                                            {subjectLabel(item.subject_type)}
                                            {' '}
                                            · 第
                                            {' '}
                                            {item.attempt_number}
                                            {' '}
                                            次
                                          </p>
                                        </div>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <SecurityStatusCell
                                          grade={item.grade}
                                          hideScore={item.evaluation_method !== null}
                                          reportState={item.report_state}
                                          scanStatus={activeStatus(item.status)}
                                          score={item.original_score}
                                        />
                                        {['document_evidence', 'hybrid'].includes(item.evaluation_method ?? '') && typeof item.quality_score === 'number'
                                          ? (
                                              <p className="mt-1 font-mono text-[10px] text-muted">
                                                {securityQualityScoreLabel(item.quality_score, item.evaluation_method)}
                                                {' · '}
                                                {qualityRatingLabel(item.quality_rating)}
                                              </p>
                                            )
                                          : null}
                                        {['queued', 'preparing', 'running'].includes(item.status)
                                          ? (
                                              <SecurityAssessmentProgress
                                                createdAt={item.created_at}
                                                nextRunAt={item.next_run_at}
                                                runtime={data.runtime}
                                                startedAt={item.started_at}
                                                status={item.status}
                                                subjectType={item.subject_type}
                                                workerId={item.worker_id}
                                              />
                                            )
                                          : null}
                                      </Table.Cell>
                                      <Table.Cell><RiskCounts item={item} /></Table.Cell>
                                      <Table.Cell>
                                        <p className="text-xs font-semibold">{item.coverage?.label ?? '当前依据待补充'}</p>
                                        {['deterministic', 'document_evidence'].includes(item.evaluation_method ?? '')
                                          ? <p className="mt-1 text-[10px] text-muted">未执行运行时验证</p>
                                          : null}
                                        <p className="mt-1 max-w-44 truncate font-mono text-[10px] text-muted">{item.source_revision?.slice(0, 12) ?? '—'}</p>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <p className="whitespace-nowrap text-xs">{formatDate(item.created_at, 'datetime')}</p>
                                        <p className="mt-1 text-[10px] text-muted">{taskStatusLabel(item.status)}</p>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <div className="flex items-center gap-1">
                                          <Button aria-label="查看评测报告" size="sm" variant="secondary" isIconOnly onPress={() => router.push(buildContextualHref(`/admin/security/${item.id}`, assessmentListHref({ pageIndex, q, status, subjectType })))}><Eye /></Button>
                                          <Button
                                            aria-label={['queued', 'preparing', 'running'].includes(item.status) ? '取消评测' : '重新扫描'}
                                            size="sm"
                                            variant="tertiary"
                                            isDisabled={
                                              !['queued', 'preparing', 'running'].includes(item.status)
                                              && !data.runtime.serviceEnabled
                                            }
                                            isIconOnly
                                            isPending={pendingId === item.id}
                                            onPress={() => void act(item)}
                                          >
                                            {['queued', 'preparing', 'running'].includes(item.status) ? <CircleStop /> : <ArrowRotateLeft />}
                                          </Button>
                                          <Button
                                            aria-label="删除评测报告"
                                            size="sm"
                                            variant="danger-soft"
                                            isDisabled={['queued', 'preparing', 'running'].includes(item.status)}
                                            isIconOnly
                                            onPress={() => setDeleteTarget(item)}
                                          >
                                            <TrashBin />
                                          </Button>
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
                    页 · 每页
                    {data.pageSize}
                    {' '}
                    条
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" isDisabled={pageIndex === 0} onPress={() => setPageIndex(value => Math.max(0, value - 1))}>上一页</Button>
                    <Button size="sm" variant="secondary" isDisabled={(pageIndex + 1) * data.pageSize >= data.total} onPress={() => setPageIndex(value => value + 1)}>下一页</Button>
                  </div>
                </Card.Footer>
              </Card>
            </>
          )}

      <details className="security-settings-drawer">
        <summary>
          <span>
            <ShieldExclamation />
            自动评测与前台展示
          </span>
          <small>系统管理员可保存；所有变更记录审计</small>
        </summary>
        <SecuritySettingsPanel />
      </details>

      <AlertDialog.Backdrop isDismissable={!pendingId} isKeyboardDismissDisabled={Boolean(pendingId)} isOpen={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-110">
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={() => setDeleteTarget(null)} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>删除评测报告？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                将删除“
                {deleteTarget?.subject_name_snapshot}
                ”本次评测及重试历史，不会删除原始内容。当前报告被删除后，前台会显示“当前依据待补充”。此操作不可撤销。
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" isDisabled={Boolean(pendingId)} slot="close" onPress={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="danger" isPending={pendingId === deleteTarget?.id} onPress={() => void remove()}>确认删除报告</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}

function activeStatus(status: string) {
  return ['queued', 'preparing', 'running'].includes(status) ? status : null
}

function assessmentListHref(filters: SecurityAssessmentListFilters) {
  const params = new URLSearchParams({ view: 'assessments' })
  if (filters.q.trim())
    params.set('q', filters.q.trim())
  if (filters.subjectType !== 'all')
    params.set('type', filters.subjectType)
  if (filters.status !== 'all')
    params.set('status', filters.status)
  if (filters.pageIndex > 0)
    params.set('page', String(filters.pageIndex + 1))
  return `/admin/security?${params}`
}

function FilterSelect({ label, onChange, options, value }: { label: string, onChange: (value: string) => void, options: Array<{ label: string, value: string }>, value: string }) {
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

function qualityRatingLabel(value: string | null) {
  return ({ exceptional: '卓越', excellent: '优秀', fair: '一般', good: '良好', poor: '需改进' } as Record<string, string>)[value ?? ''] ?? '待评定'
}

function replaceAdminSecurityUrl(href: string) {
  window.history.replaceState(window.history.state, '', href)
}

function RiskCounts({ item }: { item: SecurityAssessmentListItem }) {
  const risks = [
    ['C', item.original_critical_count, 'critical'],
    ['H', item.original_high_count, 'high'],
    ['M', item.original_medium_count, 'medium'],
    ['L', item.original_low_count, 'low'],
  ] as const
  return (
    <div className="security-risk-counts">
      {risks.map(([label, value, tone]) => (
        <span key={tone} data-tone={tone}>
          <i>{label}</i>
          {value}
        </span>
      ))}
    </div>
  )
}

function subjectLabel(type: string) {
  return SUBJECT_OPTIONS.find(option => option.value === type)?.label ?? type
}

function SubjectMark({ type }: { type: string }) {
  return <span className="security-subject-mark">{type === 'prompt' ? 'P' : type.startsWith('mcp') ? 'M' : 'S'}</span>
}

function taskStatusLabel(status: string) {
  return STATUS_OPTIONS.find(option => option.value === status)?.label ?? status
}

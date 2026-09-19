'use client'

import {
  ArrowRotateLeft,
  Check,
  Clock,
  Code,
  Envelope,
  Magnifier,
  PencilToSquare,
  Person,
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
  toast,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { markdownPlainText } from '@/lib/content/markdown'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import { AdminSectionHeader, AdminToolbar } from '../../admin-ui'
import SecurityStatusCell from '../../security/security-status-cell'
import { isCheckableGitSource } from '../../security/source-check-model'
import SourceLinkStatus from '../../security/source-link-status'
import { useSourceChecks } from '../../security/use-source-checks'
import { SUBMISSION_STATUS_META, SUBMISSION_STATUS_OPTIONS } from '../shared/meta'

import type { PaginatingResponse, SkillSubmission, SkillSubmissionStatus } from '@/types'

const PAGE_SIZE = 20

const STATUS_ICON = {
  approved: Check,
  pending: Clock,
  pending_security: ShieldExclamation,
  rejected: Xmark,
} as const

interface SkillSubmissionListFilters {
  pageIndex: number
  q: string
  status: SkillSubmissionStatus | 'all'
}

export default function SkillSubmissions({ initialFilters = { pageIndex: 0, q: '', status: 'pending' } }: {
  initialFilters?: SkillSubmissionListFilters
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialFilters.q)
  const [status, setStatus] = useState<SkillSubmissionStatus | 'all'>(initialFilters.status)
  const [pageIndex, setPageIndex] = useState(initialFilters.pageIndex)
  const [scanningId, setScanningId] = useState<string | null>(null)
  const sourceChecks = useSourceChecks()
  const paramsRef = useRef({ ...initialFilters, pageSize: PAGE_SIZE })

  const { data, error, loading, run } = useRequest<PaginatingResponse<SkillSubmission>>('/skill-submissions', {
    manual: true,
  })
  const submissions = useMemo(() => data?.list ?? [], [data])
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback((overrides: Partial<typeof paramsRef.current> = {}) => {
    const next = { ...paramsRef.current, ...overrides }
    paramsRef.current = next
    return run({ ...next, status: next.status === 'all' ? '' : next.status })
  }, [run])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  const search = () => {
    const next = { pageIndex: 0, q, status }
    setPageIndex(0)
    void load({ pageIndex: 0, q, status }).catch(() => {})
    syncSkillSubmissionUrl(next)
  }

  const reset = () => {
    setQ('')
    setStatus('pending')
    setPageIndex(0)
    void load({ pageIndex: 0, q: '', status: 'pending' }).catch(() => {})
    syncSkillSubmissionUrl({ pageIndex: 0, q: '', status: 'pending' })
  }

  const changePage = (nextPage: number) => {
    setPageIndex(nextPage)
    void load({ pageIndex: nextPage }).catch(() => {})
    syncSkillSubmissionUrl({
      pageIndex: nextPage,
      q: paramsRef.current.q,
      status: paramsRef.current.status,
    })
  }

  const openReview = (submission: SkillSubmission) => {
    const current = paramsRef.current
    const returnTo = skillSubmissionListHref({
      pageIndex: current.pageIndex,
      q: current.q,
      status: current.status,
    })
    router.push(buildContextualHref(`/admin/skills/submissions/${submission.id}/review`, returnTo))
  }

  const scan = async (submission: SkillSubmission) => {
    setScanningId(submission.id)
    try {
      await request('/admin/security-assessments', {
        body: JSON.stringify({
          force: Boolean(submission.security_assessment_id),
          requestId: submission.security_assessment_id ? crypto.randomUUID() : undefined,
          subjectId: submission.id,
          subjectType: 'skill_submission',
        }),
        method: 'POST',
      })
      toast.success(submission.security_assessment_id ? '重新扫描已加入队列' : '安全评测已加入队列')
      await load()
    }
    finally {
      setScanningId(null)
    }
  }

  return (
    <Card className="admin-flat-panel overflow-hidden">
      <Card.Header className="block p-0">
        <AdminSectionHeader
          title="Skills 投稿"
          actions={(
            <span data-tone={loading && data ? 'info' : 'neutral'} className="admin-ui-status">
              共
              {total}
              {' '}
              条
              {loading && data ? ' · 更新中' : ''}
            </span>
          )}
          description="审核社区提交的能力包与安全评测结果"
        />
        <AdminToolbar>
          <SearchField aria-label="搜索投稿" variant="secondary" value={q} onChange={setQ} className="min-w-[220px] flex-1 lg:max-w-[360px]">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="名称、作者、投稿人…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <Select aria-label="审核状态" variant="secondary" value={status} onChange={value => setStatus(value as typeof status)} className="min-w-40">
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="全部状态">
                  全部状态
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {SUBMISSION_STATUS_OPTIONS.map(option => (
                  <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Button size="sm" isPending={loading} onPress={search}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <Magnifier />}
                查询
              </>
            )}
          </Button>
          <Button size="sm" variant="secondary" isDisabled={loading} onPress={reset}>
            <ArrowRotateLeft />
            重置
          </Button>
        </AdminToolbar>
      </Card.Header>

      <Card.Content className="p-0">
        {error
          ? (
              <div className="p-4">
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>投稿队列加载失败</Alert.Title>
                    <Alert.Description>请检查接口或数据库配置后重试。</Alert.Description>
                  </Alert.Content>
                  <Button size="sm" variant="danger" onPress={() => void load().catch(() => {})}>重试</Button>
                </Alert>
              </div>
            )
          : loading && !data
            ? <div className="grid min-h-72 place-items-center"><Spinner /></div>
            : !submissions.length
                ? <EmptyContent />
                : (
                    <div className="divide-y divide-border">
                      {submissions.map((submission) => {
                        const meta = SUBMISSION_STATUS_META[submission.status]
                        const StatusIcon = STATUS_ICON[submission.status]

                        return (
                          <article key={submission.id} className="grid gap-4 px-3 py-5 sm:px-5 xl:grid-cols-[minmax(0,1fr)_210px_150px_auto] xl:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black tracking-[-0.015em]">{submission.name}</p>
                                <Chip color={meta.color} size="sm" variant="soft">
                                  <StatusIcon className="size-3" />
                                  {meta.label}
                                </Chip>
                                <Chip size="sm" variant="secondary">{submission.category}</Chip>
                              </div>

                              <p className="mt-1 text-sm font-semibold">{submission.summary}</p>
                              <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted">{markdownPlainText(submission.description)}</p>

                              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                {submission.platforms.map(platform => <Chip key={platform} size="sm" variant="soft">{platform}</Chip>)}
                                {submission.tags.map(tag => (
                                  <Chip key={tag} size="sm" variant="soft">
                                    #
                                    {tag}
                                  </Chip>
                                ))}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                <SourceLinkStatus
                                  emptyLabel="站内原创内容"
                                  result={sourceChecks.resultFor('skill_submission', submission.id)}
                                  sourceUrl={submission.source_url}
                                />
                                {submission.install_command
                                  ? <code className="max-w-full truncate rounded-md bg-surface-secondary px-2 py-1 font-mono text-[11px]">{submission.install_command}</code>
                                  : null}
                              </div>

                              {submission.review_note
                                ? (
                                    <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
                                      审核备注：
                                      {submission.review_note}
                                    </p>
                                  )
                                : null}
                            </div>

                            <div className="space-y-2 text-xs text-muted">
                              <p className="flex items-center gap-2 text-foreground">
                                <Person className="size-4" />
                                <strong>{submission.author_name}</strong>
                              </p>
                              <p className="flex items-center gap-2">
                                <PencilToSquare className="size-4" />
                                投稿人：
                                {submission.submitter_name || '未填写'}
                              </p>
                              {submission.submitter_email
                                ? (
                                    <p className="flex min-w-0 items-center gap-2">
                                      <Envelope className="size-4 shrink-0" />
                                      <span className="truncate">{submission.submitter_email}</span>
                                    </p>
                                  )
                                : null}
                              <p>
                                提交于
                                {formatDate(submission.created_at, 'datetime')}
                              </p>
                              <p className="truncate">
                                /
                                {submission.slug}
                              </p>
                            </div>

                            <SecurityStatusCell
                              grade={submission.security_grade}
                              reportState={submission.security_report_state}
                              scanStatus={submission.security_scan_status}
                              score={submission.security_score}
                            />

                            <div className="flex flex-wrap gap-1 xl:justify-end">
                              {submission.source_kind === 'git_repository' && isCheckableGitSource(submission.source_url ?? '')
                                ? (
                                    <Button
                                      size="sm"
                                      variant="tertiary"
                                      isPending={sourceChecks.isChecking('skill_submission', submission.id)}
                                      onPress={() => void sourceChecks.check({ subjectId: submission.id, subjectType: 'skill_submission' })}
                                    >
                                      <Code />
                                      检查来源
                                    </Button>
                                  )
                                : null}
                              {submission.status !== 'approved'
                                ? (
                                    <Button size="sm" variant="secondary" isPending={scanningId === submission.id} onPress={() => void scan(submission)}>
                                      <ShieldExclamation />
                                      {submission.security_assessment_id ? '重扫' : '扫描'}
                                    </Button>
                                  )
                                : null}
                              <Button
                                size="sm"
                                variant={submission.status === 'pending' || submission.status === 'pending_security' ? 'primary' : 'ghost'}
                                onPress={() => openReview(submission)}
                              >
                                <PencilToSquare />
                                {submission.status === 'pending' || submission.status === 'pending_security' ? '审核内容' : '查看内容'}
                              </Button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
      </Card.Content>

      <Card.Footer className="flex items-center justify-between border-t border-border px-0 pt-3">
        <span className="text-xs text-muted">
          第
          {pageIndex + 1}
          {' '}
          /
          {pageCount}
          {' '}
          页
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" isDisabled={pageIndex <= 0 || loading} onPress={() => changePage(pageIndex - 1)}>上一页</Button>
          <Button size="sm" variant="secondary" isDisabled={pageIndex + 1 >= pageCount || loading} onPress={() => changePage(pageIndex + 1)}>下一页</Button>
        </div>
      </Card.Footer>
    </Card>
  )
}

function skillSubmissionListHref(filters: SkillSubmissionListFilters) {
  const params = new URLSearchParams()
  if (filters.q.trim())
    params.set('q', filters.q.trim())
  if (filters.status !== 'pending')
    params.set('status', filters.status)
  if (filters.pageIndex > 0)
    params.set('page', String(filters.pageIndex + 1))
  return params.size ? `/admin/skills/submissions?${params}` : '/admin/skills/submissions'
}

function syncSkillSubmissionUrl(filters: SkillSubmissionListFilters) {
  window.history.replaceState(window.history.state, '', skillSubmissionListHref(filters))
}

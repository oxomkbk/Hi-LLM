'use client'

import {
  ArrowRotateLeft,
  Check,
  Clock,
  Eye,
  Magnifier,
  PencilToSquare,
  Xmark,
} from '@gravity-ui/icons'
import {
  Button,
  Card,
  Chip,
  Link,
  ListBox,
  SearchField,
  Select,
  Spinner,
  useOverlayState,
} from '@heroui/react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { formatDate, generateLogoUrl } from '@/lib/utils'

import { AdminSectionHeader, AdminToolbar } from '../admin-ui'
import SubmissionEditModal from './edit-modal'
import ReviewDialog from './review-dialog'

import type { CategoryOption, PaginatingResponse, WebsiteSubmission, WebsiteSubmissionStatus } from '@/types'

const STATUS_OPTIONS: { id: WebsiteSubmissionStatus | 'all', label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'pending', label: '待审核' },
  { id: 'approved', label: '已通过' },
  { id: 'rejected', label: '已拒绝' },
]

const STATUS_META = {
  pending: { label: '待审核', color: 'warning', icon: Clock },
  approved: { label: '已通过', color: 'success', icon: Check },
  rejected: { label: '已拒绝', color: 'danger', icon: Xmark },
} as const

export default function Submissions() {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<WebsiteSubmissionStatus | 'all'>('pending')
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<WebsiteSubmission | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const editState = useOverlayState()
  const reviewState = useOverlayState()
  const paramsRef = useRef({ name: '', status: 'pending', pageIndex: 0, pageSize: 20 })

  const { data: categoryData } = useRequest<CategoryOption[]>('/public/categories')
  const categories = useMemo(() => categoryData ?? [], [categoryData])

  const { data, loading, run } = useRequest<PaginatingResponse<WebsiteSubmission>>('/submissions', {
    manual: true,
  })
  const submissions = useMemo(() => data?.list ?? [], [data])
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / 20))

  const load = useCallback((overrides: Record<string, unknown> = {}) => {
    const next = { ...paramsRef.current, ...overrides }
    paramsRef.current = next as typeof paramsRef.current
    return run(next)
  }, [run])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  const search = () => {
    setPageIndex(0)
    void load({ name, status: status === 'all' ? '' : status, pageIndex: 0 }).catch(() => {})
  }

  const reset = () => {
    setName('')
    setStatus('pending')
    setPageIndex(0)
    void load({ name: '', status: 'pending', pageIndex: 0 }).catch(() => {})
  }

  const changePage = (nextPage: number) => {
    setPageIndex(nextPage)
    void load({ pageIndex: nextPage }).catch(() => {})
  }

  const openEdit = (submission: WebsiteSubmission) => {
    setSelected(submission)
    editState.open()
  }

  const openReview = (submission: WebsiteSubmission, action: 'approve' | 'reject') => {
    setSelected(submission)
    setReviewAction(action)
    reviewState.open()
  }

  return (
    <>
      <Card className="admin-flat-panel">
        <Card.Header className="block p-0">
          <AdminSectionHeader
            title="网站投稿"
            actions={(
              <span data-tone="neutral" className="admin-ui-status">
                共
                {total}
                {' '}
                条
              </span>
            )}
            description="审核社区提交的网站资料，通过后直接进入导航库"
          />
          <AdminToolbar>
            <SearchField aria-label="网站名称" variant="secondary" value={name} onChange={setName}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="网站名称" className="w-40" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Select aria-label="审核状态" variant="secondary" value={status} onChange={value => setStatus(value as typeof status)} className="w-36">
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {STATUS_OPTIONS.map(option => (
                    <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
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

        <Card.Content className="px-0">
          {loading && !data
            ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
            : !submissions.length
                ? <EmptyContent />
                : (
                    <div className="divide-y divide-border">
                      {submissions.map((submission) => {
                        const meta = STATUS_META[submission.status]
                        const StatusIcon = meta.icon

                        return (
                          <article key={submission.id} className="grid gap-4 px-2 py-5 xl:grid-cols-[1fr_auto] xl:items-center">
                            <div className="flex min-w-0 items-start gap-4">
                              <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl border border-border bg-white">
                                {submission.logo
                                  ? <Image alt={submission.name} fill src={generateLogoUrl(submission.logo)} className="object-contain p-1.5" />
                                  : <div className="grid size-full place-items-center font-black text-black">{submission.name.slice(0, 1)}</div>}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link href={submission.url} rel="noopener noreferrer" target="_blank" className="font-black">
                                    {submission.name}
                                    <Link.Icon />
                                  </Link>
                                  <Chip color={meta.color} size="sm" variant="soft">
                                    <StatusIcon className="size-3" />
                                    {meta.label}
                                  </Chip>
                                  {(submission.categories?.length ? submission.categories : [submission.category]).map((category, index) => (
                                    <Chip key={category.id} color={index === 0 ? 'accent' : 'default'} size="sm" variant="secondary">
                                      {category.name}
                                    </Chip>
                                  ))}
                                </div>
                                {submission.desc ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{submission.desc}</p> : null}
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {submission.tags?.map(tag => <Chip key={tag} size="sm" variant="soft">{tag}</Chip>)}
                                  {submission.vpn ? <Chip color="warning" size="sm" variant="soft">VPN</Chip> : null}
                                  {submission.pinned ? <Chip size="sm" variant="soft">置顶</Chip> : null}
                                  {submission.recommend ? <Chip size="sm" variant="soft">推荐</Chip> : null}
                                </div>
                                <p className="mt-2 text-[10px] text-muted">
                                  提交于
                                  {formatDate(submission.created_at, 'datetime')}
                                  {submission.review_note ? ` · 备注：${submission.review_note}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 xl:justify-end">
                              {submission.status !== 'approved'
                                ? (
                                    <>
                                      <Button size="sm" variant="ghost" onPress={() => openEdit(submission)}>
                                        <PencilToSquare />
                                        编辑
                                      </Button>
                                      <Button size="sm" variant="secondary" onPress={() => openReview(submission, 'reject')}>
                                        <Xmark />
                                        拒绝
                                      </Button>
                                      <Button size="sm" onPress={() => openReview(submission, 'approve')}>
                                        <Check />
                                        通过并发布
                                      </Button>
                                    </>
                                  )
                                : (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                                      <Eye />
                                      已发布，请在网站列表维护
                                    </span>
                                  )}
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

      <SubmissionEditModal
        key={selected ? `${selected.id}-${selected.updated_at}` : 'empty-edit'}
        categories={categories}
        state={editState}
        submission={selected}
        onSaved={() => void load().catch(() => {})}
      />
      <ReviewDialog
        key={selected ? `${selected.id}-${reviewAction}-${selected.review_note ?? ''}` : 'empty-review'}
        action={reviewAction}
        state={reviewState}
        submission={selected}
        onReviewed={() => void load().catch(() => {})}
      />
    </>
  )
}

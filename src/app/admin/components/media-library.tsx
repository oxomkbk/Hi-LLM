'use client'

import {
  ArrowRotateLeft,
  Cloud,
  Eye,
  File,
  HardDrive,
  Lock,
  Magnifier,
  TrashBin,
} from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Chip,
  ListBox,
  SearchField,
  Select,
  Spinner,
  toast,
  useOverlayState,
} from '@heroui/react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import CatalogPagination from '@/components/catalog/catalog-pagination'
import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { formatDate, RESPONSE } from '@/lib/utils'

import { AdminSectionHeader, AdminToolbar } from './admin-ui'

import type { AdminMediaFile, AdminMediaFileStatus, AdminMediaResponse } from '@/types'

const PAGE_SIZE = 24

const PROVIDERS = [
  { id: 'all', label: '全部' },
  { id: 'local-filesystem', label: '本地' },
  { id: 'tencent-cos', label: '腾讯云 COS' },
] as const

const STATUSES: { id: AdminMediaFileStatus | 'all', label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'ready', label: '可用' },
  { id: 'pending', label: '上传中' },
  { id: 'quarantined', label: '校验中' },
  { id: 'failed', label: '上传失败' },
  { id: 'delete_failed', label: '删除失败' },
  { id: 'deleting', label: '删除中' },
]

const STATUS_META = {
  delete_failed: { color: 'danger', label: '删除失败' },
  deleting: { color: 'warning', label: '删除中' },
  failed: { color: 'danger', label: '上传失败' },
  pending: { color: 'warning', label: '上传中' },
  quarantined: { color: 'warning', label: '校验中' },
  ready: { color: 'success', label: '可用' },
} as const

type ProviderFilter = typeof PROVIDERS[number]['id']

export default function MediaLibrary() {
  const [q, setQ] = useState('')
  const [provider, setProvider] = useState<ProviderFilter>('all')
  const [status, setStatus] = useState<AdminMediaFileStatus | 'all'>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<AdminMediaFile | null>(null)
  const deleteState = useOverlayState()
  const paramsRef = useRef({ pageIndex: 0, pageSize: PAGE_SIZE, provider: '', q: '', status: '' })

  const { data, error, loading, run } = useRequest<AdminMediaResponse>('/admin/files', { manual: true })
  const { loading: deleting, run: remove } = useRequest('/admin/files', { method: 'DELETE', manual: true })
  const files = useMemo(() => data?.list ?? [], [data])
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const rangeEnd = Math.min(total, (pageIndex + 1) * PAGE_SIZE)

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
    void load({
      pageIndex: 0,
      provider: provider === 'all' ? '' : provider,
      q,
      status: status === 'all' ? '' : status,
    }).catch(() => {})
  }

  const changeProvider = (nextProvider: ProviderFilter) => {
    setProvider(nextProvider)
    setPageIndex(0)
    void load({
      pageIndex: 0,
      provider: nextProvider === 'all' ? '' : nextProvider,
      q,
      status: status === 'all' ? '' : status,
    }).catch(() => {})
  }

  const changeStatus = (nextStatus: AdminMediaFileStatus | 'all') => {
    setStatus(nextStatus)
    setPageIndex(0)
    void load({
      pageIndex: 0,
      provider: provider === 'all' ? '' : provider,
      q,
      status: nextStatus === 'all' ? '' : nextStatus,
    }).catch(() => {})
  }

  const changePage = (page: number) => {
    const nextPageIndex = Math.min(pageCount - 1, Math.max(0, page - 1))
    if (nextPageIndex === pageIndex)
      return
    setPageIndex(nextPageIndex)
    void load({ pageIndex: nextPageIndex }).catch(() => {})
  }

  const reset = () => {
    setQ('')
    setProvider('all')
    setStatus('all')
    setPageIndex(0)
    void load({ pageIndex: 0, provider: '', q: '', status: '' }).catch(() => {})
  }

  const confirmDelete = async () => {
    if (!selected)
      return
    const result = await remove(selected.id).catch(() => null)
    if (result?.code === RESPONSE.SUCCESS) {
      toast.success('文件已删除')
      deleteState.close()
      setSelected(null)
      const nextPage = files.length === 1 && pageIndex > 0 ? pageIndex - 1 : pageIndex
      setPageIndex(nextPage)
      await load({ pageIndex: nextPage })
    }
  }

  return (
    <>
      <section className="admin-data-view">
        <header>
          <AdminSectionHeader
            title="素材库"
            actions={(
              <span data-tone="neutral" className="admin-ui-status">
                共
                {total}
                {' '}
                个文件
              </span>
            )}
            description="按存储位置和文件状态查找、预览与清理图片素材"
          />
          <AdminToolbar className="flex-col items-stretch 2xl:flex-row 2xl:items-center">
            <div aria-label="按存储类型筛选" className="flex flex-wrap gap-1">
              {PROVIDERS.map(item => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={provider === item.id ? 'primary' : 'ghost'}
                  onPress={() => changeProvider(item.id)}
                >
                  {item.id === 'local-filesystem' ? <HardDrive /> : item.id === 'tencent-cos' ? <Cloud /> : null}
                  {item.label}
                  <span className="text-[11px] tabular-nums opacity-65">{data?.providerTotals[item.id] ?? 0}</span>
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_140px_auto_auto] 2xl:w-auto">
              <SearchField
                aria-label="搜索文件"
                variant="secondary"
                value={q}
                onChange={setQ}
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    search()
                }}
                className="col-span-2 sm:col-span-1"
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="搜索文件名" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Select
                aria-label="文件状态"
                variant="secondary"
                value={status}
                onChange={value => changeStatus(value as typeof status)}
                className="col-span-2 sm:col-span-1"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {STATUSES.map(item => (
                      <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
                        {item.label}
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
              <Button aria-label="重置筛选" size="sm" variant="secondary" isDisabled={loading} onPress={reset}>
                <ArrowRotateLeft />
                重置
              </Button>
            </div>
          </AdminToolbar>

          <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-xs text-muted">
            <p>{total > 0 ? `显示 ${rangeStart}–${rangeEnd}，共 ${total} 个素材` : '暂无符合条件的素材'}</p>
            <p aria-live="polite" className={loading ? 'visible' : 'invisible'}>正在更新…</p>
          </div>
        </header>

        {error
          ? (
              <div className="grid min-h-64 place-items-center text-sm text-muted">
                <div className="text-center">
                  <p>素材加载失败</p>
                  <Button size="sm" variant="secondary" onPress={() => void load().catch(() => {})} className="mt-3">重试</Button>
                </div>
              </div>
            )
          : loading && !data
            ? <MediaGridSkeleton />
            : files.length === 0
              ? <EmptyContent />
              : (
                  <ul
                    aria-busy={loading}
                    aria-label="素材文件"
                    className={`media-library-grid mt-4 ${loading ? 'opacity-55' : ''}`}
                  >
                    {files.map(file => (
                      <MediaCard
                        key={file.id}
                        file={file}
                        onDelete={() => {
                          setSelected(file)
                          deleteState.open()
                        }}
                      />
                    ))}
                  </ul>
                )}

        <footer className="mt-4 border-t border-border pt-4">
          <p className="text-center text-xs text-muted sm:text-left">
            第
            {' '}
            {pageIndex + 1}
            {' '}
            /
            {' '}
            {pageCount}
            {' '}
            页
          </p>
          <CatalogPagination
            ariaLabel="素材库分页"
            disabled={loading}
            page={pageIndex + 1}
            totalPages={pageCount}
            onPageChange={changePage}
          />
        </footer>
      </section>

      <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={deleteState.isOpen} onOpenChange={deleteState.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={deleteState.close} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>删除文件？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="break-all text-sm text-muted">{selected?.original_name}</p>
              <p className="mt-2 text-sm">数据库记录和实际存储对象都会删除，无法恢复。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" isDisabled={deleting} slot="close" onPress={deleteState.close}>取消</Button>
              <Button variant="danger" isPending={deleting} onPress={() => void confirmDelete()}>
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : <TrashBin />}
                    {isPending ? '删除中…' : '删除'}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  )
}

function formatBytes(value: string) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0)
    return '-'
  if (bytes < 1024)
    return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let size = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024
    unit = units[index]
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${unit}`
}

function MediaCard({ file, onDelete }: { file: AdminMediaFile, onDelete: () => void }) {
  const deleteDisabled = file.reference_count > 0
    || file.status === 'pending'
    || file.status === 'quarantined'
    || file.status === 'deleting'
  const providerLabel = file.storage_profile.provider === 'tencent-cos'
    ? '腾讯云 COS'
    : file.storage_profile.provider === 'local-filesystem'
      ? '本地文件'
      : '未知存储'

  return (
    <li className="media-library-card group">
      <div className="media-library-preview relative aspect-[4/3] overflow-hidden">
        {file.url
          ? (
              <Link
                aria-label={`查看 ${file.original_name}`}
                href={file.url}
                rel="noreferrer"
                target="_blank"
                className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <MediaPreview key={file.url ?? file.status} file={file} />
              </Link>
            )
          : <MediaPreview key={file.status} file={file} />}

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-4rem)] items-center gap-1">
          <Chip color={STATUS_META[file.status].color} size="sm" variant="soft">
            {STATUS_META[file.status].label}
          </Chip>
          {file.visibility === 'private'
            ? (
                <span title="私有文件" className="grid size-6 place-items-center rounded-full bg-surface/90 text-muted shadow-sm backdrop-blur-sm">
                  <Lock className="size-3" />
                  <span className="sr-only">私有文件</span>
                </span>
              )
            : null}
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {file.url
            ? (
                <Link
                  aria-label={`新标签页查看 ${file.original_name}`}
                  title="查看原图"
                  href={file.url}
                  rel="noreferrer"
                  target="_blank"
                  className="media-library-action"
                >
                  <Eye className="size-4" />
                </Link>
              )
            : null}
          <Button
            aria-label={`删除 ${file.original_name}`}
            size="sm"
            variant="secondary"
            isDisabled={deleteDisabled}
            isIconOnly
            onPress={onDelete}
            className="media-library-action text-danger"
          >
            <TrashBin className="size-4" />
          </Button>
        </div>
      </div>

      <div className="p-3">
        <p title={file.original_name} className="truncate text-sm font-semibold text-foreground">{file.original_name}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="truncate uppercase">
            {file.extension || file.mime_type.split('/')[1] || 'FILE'}
            {' · '}
            {formatBytes(file.size_bytes)}
          </span>
          <span className="shrink-0 tabular-nums">{formatDate(file.created_at)}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-[11px] text-muted">
          <span title={`${file.storage_profile.name} · ${providerLabel}`} className="flex min-w-0 items-center gap-1.5">
            {file.storage_profile.provider === 'tencent-cos'
              ? <Cloud className="size-3.5 shrink-0" />
              : <HardDrive className="size-3.5 shrink-0" />}
            <span className="truncate">{file.storage_profile.name}</span>
          </span>
          {file.reference_count > 0
            ? (
                <span className="shrink-0 font-medium text-foreground">
                  引用
                  {' '}
                  {file.reference_count}
                </span>
              )
            : <span className="shrink-0">未引用</span>}
        </div>
      </div>
    </li>
  )
}

function MediaGridSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在加载素材" className="media-library-grid mt-4">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl bg-surface-secondary">
          <div className="aspect-[4/3] animate-pulse bg-default" />
          <div className="space-y-2.5 p-3">
            <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-default" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-default" />
            <div className="h-7 animate-pulse border-t border-border/70 pt-2.5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MediaPreview({ file }: { file: AdminMediaFile }) {
  const [failed, setFailed] = useState(false)

  if (file.url && file.mime_type.startsWith('image/') && !failed) {
    return (
      <Image
        alt=""
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 220px"
        src={file.url}
        unoptimized
        onError={() => setFailed(true)}
        className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.02]"
      />
    )
  }

  return (
    <div className="absolute inset-0 grid place-items-center text-muted">
      <div className="text-center">
        <File className="mx-auto size-8" />
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em]">
          {file.extension || 'FILE'}
        </p>
      </div>
    </div>
  )
}

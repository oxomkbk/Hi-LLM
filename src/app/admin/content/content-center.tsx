'use client'

import {
  ArrowRight,
  ArrowRotateLeft,
  Code,
  MagicWand,
  Magnifier,
  Plus,
  Server,
  ShieldCheck,
  ShieldExclamation,
  StarFill,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Chip,
  Pagination,
  SearchField,
  Spinner,
  Table,
} from '@heroui/react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { catalogIconSource } from '@/lib/catalog-icons'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import { AdminPageHeader, AdminSectionHeader, AdminToolbar } from '../components/admin-ui'
import { buildPageItems, pageRange } from './pagination-model'

import type {
  AdminContentItem,
  AdminContentPage,
  AdminContentSecurityFilter,
  AdminContentStatus,
  AdminContentType,
} from '@/lib/admin/content-center.shared'

const PAGE_SIZE = 24

const TYPE_META = {
  mcp: { icon: Server, label: 'MCP' },
  prompt: { icon: MagicWand, label: 'Prompt' },
  skill: { icon: Code, label: 'Skill' },
} as const

const STATUS_META = {
  archived: { color: 'default', label: '已归档' },
  draft: { color: 'warning', label: '草稿' },
  published: { color: 'success', label: '已发布' },
} as const

export default function ContentCenter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const serializedParams = searchParams.toString()
  const page = positiveInteger(searchParams.get('page'), 1)
  const type = enumParam<AdminContentType>(searchParams.get('type'), ['mcp', 'prompt', 'skill'])
  const status = enumParam<AdminContentStatus>(searchParams.get('status'), ['archived', 'draft', 'published'])
  const security = enumParam<AdminContentSecurityFilter>(searchParams.get('security'), ['active', 'attention', 'passed', 'unassessed'])
  const query = searchParams.get('q')?.slice(0, 100) ?? ''
  const [queryDraft, setQueryDraft] = useState({ source: query, value: query })
  const [data, setData] = useState<AdminContentPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSequenceRef = useRef(0)
  const draftQuery = queryDraft.source === query ? queryDraft.value : query

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await request<AdminContentPage>('/admin/content', {
        params: {
          page,
          pageSize: PAGE_SIZE,
          q: query || undefined,
          security: security || undefined,
          status: status || undefined,
          type: type || undefined,
        },
      })
      if (requestId === requestSequenceRef.current) {
        const resultPages = Math.max(1, Math.ceil(result.data.total / PAGE_SIZE))
        if (page > resultPages) {
          const next = new URLSearchParams(serializedParams)
          next.set('page', String(resultPages))
          router.replace(`${pathname}?${next}`, { scroll: false })
          return
        }
        setData(result.data)
      }
    }
    catch (reason) {
      if (requestId === requestSequenceRef.current)
        setError(reason instanceof Error ? reason.message : '内容中心加载失败')
    }
    finally {
      if (requestId === requestSequenceRef.current)
        setLoading(false)
    }
  }, [page, pathname, query, router, security, serializedParams, status, type])

  useEffect(() => {
    void load()
  }, [load, serializedParams])

  const updateParams = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === 'all')
        next.delete(key)
      else
        next.set(key, String(value))
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  const reset = () => {
    setQueryDraft({ source: '', value: '' })
    router.replace(pathname, { scroll: false })
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const visibleRange = pageRange(page, PAGE_SIZE, data?.total ?? 0)
  const hasFilters = Boolean(query || type || status || security)
  const returnTo = serializedParams ? `${pathname}?${serializedParams}` : pathname

  return (
    <div className="admin-content-workspace grid gap-3">
      <AdminPageHeader
        title="目录内容"
        actions={(
          <div className="flex flex-wrap gap-2">
            <QuickCreate href={buildContextualHref('/admin/skills/new', returnTo)} label="新建 Skill" />
            <QuickCreate href={buildContextualHref('/admin/mcp/new', returnTo)} label="新建 MCP" />
            <QuickCreate href="/admin/prompts?create=1" label="新建 Prompt" primary />
          </div>
        )}
        description="集中管理 Skill、MCP 与 Prompt 的发布状态、安全结论和负责人。"
      />

      <SummaryStrip data={data} loading={loading && !data} />

      {data?.unavailableTypes.length
        ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>部分内容类型暂不可用</Alert.Title>
                <Alert.Description>
                  {data.unavailableTypes.map(item => TYPE_META[item].label).join('、')}
                  {' 数据表尚未就绪；其他内容仍可正常管理。'}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )
        : null}

      <Card className="admin-flat-panel overflow-hidden">
        <Card.Header className="border-b-0 p-0">
          <AdminSectionHeader
            title="内容目录"
            description={(
              <span aria-live="polite">
                {loading && data ? '正在更新…' : `共 ${formatCount(data?.total ?? 0)} 条结果`}
              </span>
            )}
          />
          <AdminToolbar className="admin-ui-toolbar--content px-4 lg:px-5">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                updateParams({ page: null, q: draftQuery.trim() })
              }}
              className="grid w-full gap-2 md:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(240px,360px)_132px_132px_148px_auto]"
            >
              <SearchField aria-label="搜索内容" variant="secondary" value={draftQuery} onChange={value => setQueryDraft({ source: query, value })}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="名称、Slug、作者…" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <FilterSelect
                ariaLabel="内容类型"
                options={[['all', '全部类型'], ['skill', 'Skills'], ['mcp', 'MCP'], ['prompt', 'Prompts']]}
                value={type ?? 'all'}
                onChange={value => updateParams({ page: null, type: value })}
              />
              <FilterSelect
                ariaLabel="内容状态"
                options={[['all', '全部状态'], ['published', '已发布'], ['draft', '草稿'], ['archived', '已归档']]}
                value={status ?? 'all'}
                onChange={value => updateParams({ page: null, status: value })}
              />
              <FilterSelect
                ariaLabel="安全状态"
                options={[['all', '全部安全状态'], ['attention', '建议核对'], ['active', '材料处理中'], ['passed', '已有参考结论'], ['unassessed', '当前依据待补充']]}
                value={security ?? 'all'}
                onChange={value => updateParams({ page: null, security: value })}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" isPending={loading} className="flex-1 xl:flex-none">
                  {loading ? <Spinner color="current" size="sm" /> : <Magnifier />}
                  查询
                </Button>
                {hasFilters
                  ? (
                      <Button aria-label="重置全部筛选" size="sm" variant="ghost" isIconOnly onPress={reset}>
                        <ArrowRotateLeft />
                      </Button>
                    )
                  : null}
              </div>
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
                      <Alert.Title>内容中心暂时不可用</Alert.Title>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" variant="danger" onPress={() => void load()}>重试</Button>
                  </Alert>
                </div>
              )
            : loading && !data
              ? <div className="grid min-h-80 place-items-center"><Spinner /></div>
              : <ContentTable items={data?.list ?? []} returnTo={returnTo} />}
        </Card.Content>

        {!error && data && data.total > 0
          ? (
              <Card.Footer className="border-t border-border px-4 py-3 lg:px-5">
                <Pagination size="sm" className="admin-content-pagination w-full">
                  <Pagination.Summary>
                    第
                    {' '}
                    {formatCount(visibleRange.start)}
                    –
                    {formatCount(visibleRange.end)}
                    {' '}
                    条，共
                    {' '}
                    {formatCount(data.total)}
                    {' '}
                    条
                  </Pagination.Summary>
                  <Pagination.Content>
                    <Pagination.Item>
                      <Pagination.Previous isDisabled={page <= 1 || loading} onPress={() => updateParams({ page: page - 1 })}>
                        <Pagination.PreviousIcon />
                        <span>上一页</span>
                      </Pagination.Previous>
                    </Pagination.Item>
                    {buildPageItems(page, pages).map(item => typeof item === 'number'
                      ? (
                          <Pagination.Item key={item}>
                            <Pagination.Link isActive={item === page} isDisabled={loading} onPress={() => updateParams({ page: item })}>
                              {item}
                            </Pagination.Link>
                          </Pagination.Item>
                        )
                      : (
                          <Pagination.Item key={item}>
                            <Pagination.Ellipsis />
                          </Pagination.Item>
                        ))}
                    <Pagination.Item>
                      <Pagination.Next isDisabled={page >= pages || loading} onPress={() => updateParams({ page: page + 1 })}>
                        <span>下一页</span>
                        <Pagination.NextIcon />
                      </Pagination.Next>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
              </Card.Footer>
            )
          : null}
      </Card>
    </div>
  )
}

function ContentTable({ items, returnTo }: { items: AdminContentItem[], returnTo: string }) {
  return (
    <Table className="admin-directory-table">
      <Table.ScrollContainer>
        <Table.Content aria-label="统一内容列表" className="admin-content-table">
          <Table.Header>
            <Table.Column id="content" isRowHeader className="admin-content-column admin-content-column--resource">内容</Table.Column>
            <Table.Column id="type" className="admin-content-column admin-content-column--type">类型</Table.Column>
            <Table.Column id="status" className="admin-content-column admin-content-column--status">发布状态</Table.Column>
            <Table.Column id="security" className="admin-content-column admin-content-column--security">安全评测</Table.Column>
            <Table.Column id="owner" className="admin-content-column admin-content-column--owner">来源 / 负责人</Table.Column>
            <Table.Column id="updated" className="admin-content-column admin-content-column--updated">最后更新</Table.Column>
            <Table.Column id="actions" className="admin-content-column admin-content-column--actions">操作</Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => <EmptyContent />}>
            {items.map(item => (
              <Table.Row key={`${item.type}:${item.id}`} id={`${item.type}:${item.id}`}>
                <Table.Cell>
                  <div className="admin-resource-cell flex items-center gap-3">
                    <ContentVisual title={item.title} type={item.type} visual={item.visual} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p title={item.title} className="admin-resource-title max-w-80 truncate text-sm font-semibold">{item.title}</p>
                        {item.featured ? <StarFill aria-label="精选内容" className="size-3.5 shrink-0 text-warning" /> : null}
                        <span className="max-w-36 truncate font-mono text-[10px] text-muted">
                          /
                          {item.slug}
                        </span>
                      </div>
                      <p title={item.summary} className="admin-resource-summary mt-0.5 max-w-[460px] truncate text-xs text-muted">{item.summary}</p>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell><Chip size="sm" variant="secondary">{TYPE_META[item.type].label}</Chip></Table.Cell>
                <Table.Cell><Chip color={STATUS_META[item.status].color} size="sm" variant="soft">{STATUS_META[item.status].label}</Chip></Table.Cell>
                <Table.Cell><SecurityState item={item} /></Table.Cell>
                <Table.Cell><p title={item.owner} className="admin-resource-owner max-w-40 truncate whitespace-nowrap text-xs">{item.owner}</p></Table.Cell>
                <Table.Cell className="admin-resource-updated whitespace-nowrap text-xs text-muted">{formatDate(item.updatedAt, 'datetime')}</Table.Cell>
                <Table.Cell>
                  <Link aria-label={`管理 ${item.title}`} href={buildContextualHref(editHref(item), returnTo)} className="admin-table-action inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-accent outline-none transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-focus">
                    管理
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  )
}

function ContentVisual({ title, type, visual }: { title: string, type: AdminContentType, visual: string | null }) {
  const Icon = TYPE_META[type].icon
  const source = catalogIconSource(visual)
  const [failedSource, setFailedSource] = useState<string | null>(null)

  return (
    <span aria-hidden="true" title={title} className="grid size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-secondary text-foreground">
      {source && source !== failedSource
        ? (
            // Catalog content may reference object-storage files or approved HTTPS images.
            // eslint-disable-next-line next/no-img-element
            <img
              alt=""
              decoding="async"
              height={40}
              loading="lazy"
              src={source}
              width={40}
              onError={() => setFailedSource(source)}
              className={`size-full ${type === 'prompt' ? 'object-cover' : 'object-contain p-1.5'}`}
            />
          )
        : <Icon className="m-auto size-4.5" />}
    </span>
  )
}

function editHref(item: AdminContentItem) {
  if (item.type === 'skill')
    return `/admin/skills/${item.id}/edit`
  if (item.type === 'mcp')
    return `/admin/mcp/${item.id}/edit`
  return `/admin/prompts?edit=${item.id}`
}

function enumParam<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && allowed.includes(value as T) ? value as T : undefined
}

function FilterSelect({ ariaLabel, onChange, options, value }: { ariaLabel: string, onChange: (value: string) => void, options: Array<[string, string]>, value: string }) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-lg border border-border bg-surface-secondary px-3 text-xs font-medium outline-none focus:border-focus focus:ring-2 focus:ring-focus/20">
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  )
}

function formatCount(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function QuickCreate({ href, label, primary = false }: { href: string, label: string, primary?: boolean }) {
  return (
    <Link href={href} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${primary ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-surface-secondary text-foreground hover:bg-surface-tertiary'}`}>
      <Plus className="size-3.5" />
      {label}
    </Link>
  )
}

function SecurityState({ item }: { item: AdminContentItem }) {
  if (item.securityScanStatus) {
    return (
      <Chip color="accent" size="sm" variant="soft">
        <Spinner color="current" size="sm" />
        材料处理中
      </Chip>
    )
  }
  if (item.securityReportState === 'passed') {
    return (
      <Chip color="success" size="sm" variant="soft">
        <ShieldCheck className="size-3.5" />
        已有参考结论
        {item.securityScore === null ? '' : ` · ${Math.round(item.securityScore)}`}
      </Chip>
    )
  }
  if (item.securityReportState && ['blocked', 'failed', 'review_required', 'stale'].includes(item.securityReportState)) {
    const blocked = item.securityReportState === 'blocked'
    const label = blocked
      ? '危险项待处理'
      : item.securityReportState === 'failed'
        ? '当前依据待补充'
        : item.securityReportState === 'stale'
          ? '参考资料更新中'
          : '有改进建议'
    return (
      <Chip color={blocked ? 'danger' : 'warning'} size="sm" variant="soft">
        <ShieldExclamation className="size-3.5" />
        {label}
      </Chip>
    )
  }
  return <span className="text-xs text-muted">当前依据待补充</span>
}

function SummaryStrip({ data, loading }: { data: AdminContentPage | null, loading: boolean }) {
  const items = useMemo(() => [
    { label: '目录内容', value: data?.summary.total ?? 0 },
    { label: '已发布', value: data?.summary.byStatus.published ?? 0 },
    { label: '草稿', value: data?.summary.byStatus.draft ?? 0 },
    { label: '已归档', value: data?.summary.byStatus.archived ?? 0 },
  ], [data])

  return (
    <Card className="admin-flat-panel overflow-hidden">
      <Card.Content className="grid grid-cols-2 p-0 lg:grid-cols-4">
        {items.map((item, index) => (
          <div key={item.label} className={`admin-summary-stat ${index % 2 ? 'border-l border-border' : ''} ${index >= 2 ? 'border-t border-border lg:border-t-0 lg:border-l' : ''}`}>
            <p className="admin-summary-stat-label">{item.label}</p>
            {loading ? <div className="mt-2 h-7 w-12 animate-pulse rounded-md bg-surface-secondary motion-reduce:animate-none" /> : <p className="admin-summary-stat-value">{data ? formatCount(item.value) : '—'}</p>}
          </div>
        ))}
      </Card.Content>
    </Card>
  )
}

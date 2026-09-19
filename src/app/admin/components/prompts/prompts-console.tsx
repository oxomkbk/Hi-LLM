'use client'

import {
  Archive,
  ArrowRotateLeft,
  Check,
  Ellipsis,
  FileZipper,
  MagicWand,
  Magnifier,
  PencilToSquare,
  Plus,
  StarFill,
  TrashBin,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  ListBox,
  SearchField,
  Select,
  Spinner,
  Table,
  toast,
  useOverlayState,
} from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import AdminListPagination from '../admin-list-pagination'
import { AdminSectionHeader } from '../admin-ui'
import PromptEditor from './prompt-editor'
import PromptImportModal from './prompt-import-modal'
import {
  buildPromptListParams,
  promptAdminListHref,
} from './prompt-search-model'

import type { PromptAdminListFilters } from './prompt-search-model'
import type {
  PaginatingResponse,
  Prompt,
  PromptCategory,
  PromptDetail,
  PromptSaveInput,
  PromptStatus,
} from '@/types'

type PromptListResponse = PaginatingResponse<Prompt> & { categories: PromptCategory[] }
const PAGE_SIZE = 20

export default function PromptsConsole({ initialFilters, requestedCreate = false, requestedEditId, requestedReturnHref }: {
  initialFilters: PromptAdminListFilters
  requestedCreate?: boolean
  requestedEditId?: string
  requestedReturnHref?: string
}) {
  const router = useRouter()
  const [data, setData] = useState<PromptListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [queryDraft, setQueryDraft] = useState({
    source: initialFilters.query,
    value: initialFilters.query,
  })
  const [selected, setSelected] = useState<PromptDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
  const editor = useOverlayState({ defaultOpen: requestedCreate || Boolean(requestedEditId) })
  const importer = useOverlayState()
  const requestIdRef = useRef(0)
  const requestedActionHandledRef = useRef(false)
  const query = queryDraft.source === initialFilters.query ? queryDraft.value : initialFilters.query
  const listHref = promptAdminListHref(initialFilters)

  const load = useCallback(async (filters: PromptAdminListFilters) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await request<PromptListResponse>('/admin/prompts', {
        params: buildPromptListParams({ ...filters, pageSize: PAGE_SIZE }),
      })
      if (requestId !== requestIdRef.current)
        return result

      setData(result.data)
      const normalizedPage = normalizeAdminPage(filters.page, result.data?.total ?? 0, PAGE_SIZE)
      if (normalizedPage !== filters.page)
        router.replace(promptAdminListHref({ ...filters, page: normalizedPage }), { scroll: false })

      return result
    }
    catch (reason) {
      if (requestId === requestIdRef.current)
        setError(errorMessage(reason, 'Prompts 数据加载失败'))
      throw reason
    }
    finally {
      if (requestId === requestIdRef.current)
        setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load({
      kind: initialFilters.kind,
      origin: initialFilters.origin,
      page: initialFilters.page,
      query: initialFilters.query,
      status: initialFilters.status,
    }).catch(() => {})
  }, [initialFilters.kind, initialFilters.origin, initialFilters.page, initialFilters.query, initialFilters.status, load])

  const navigate = (filters: PromptAdminListFilters) => {
    const href = promptAdminListHref(filters)
    if (href === listHref)
      void load(filters).catch(() => {})
    else
      router.replace(href, { scroll: false })
  }

  const submitSearch = () => {
    const nextQuery = query.trim().slice(0, 100)
    setQueryDraft({ source: nextQuery, value: nextQuery })
    navigate({ ...initialFilters, page: 1, query: nextQuery })
  }

  const reset = () => {
    setQueryDraft({ source: '', value: '' })
    navigate({ kind: 'all', origin: 'all', page: 1, query: '', status: 'all' })
  }

  const openCreate = useCallback(() => {
    setActionError(null)
    setSelected(null)
    editor.open()
  }, [editor])
  const openEdit = useCallback(async (id: string) => {
    await Promise.resolve()
    setActionError(null)
    setSelected(null)
    setLoadingDetail(true)
    editor.open()
    try {
      setSelected((await request<PromptDetail>(`/admin/prompts/${id}`)).data)
    }
    catch (reason) {
      setActionError(errorMessage(reason, 'Prompt 详情加载失败'))
      editor.close()
      if (id === requestedEditId && requestedReturnHref)
        router.replace(requestedReturnHref)
    }
    finally {
      setLoadingDetail(false)
    }
  }, [editor, requestedEditId, requestedReturnHref, router])

  useEffect(() => {
    if (requestedActionHandledRef.current || !requestedEditId)
      return
    requestedActionHandledRef.current = true
    void openEdit(requestedEditId)
  }, [openEdit, requestedEditId])

  const changeStatus = async (prompt: Prompt) => {
    const next: PromptStatus = prompt.status === 'draft' ? 'published' : prompt.status === 'published' ? 'archived' : 'draft'
    try {
      setActionError(null)
      const detail = (await request<PromptDetail>(`/admin/prompts/${prompt.id}`)).data
      await request(`/admin/prompts/${prompt.id}`, { body: JSON.stringify(toPayload(detail, next)), method: 'PUT' })
      toast.success(next === 'published' ? 'Prompt 已发布' : next === 'archived' ? 'Prompt 已归档' : '已恢复为草稿')
      await load(initialFilters)
    }
    catch (reason) {
      setActionError(errorMessage(reason, `“${prompt.title}”状态更新失败`))
    }
  }

  const remove = async (prompt: Prompt) => {
    if (deleteCandidateId !== prompt.id) {
      setDeleteCandidateId(prompt.id)
      toast.warning(`请再次点击删除“${prompt.title}”`)
      return
    }
    try {
      setActionError(null)
      await request(`/admin/prompts/${prompt.id}`, { method: 'DELETE' })
      toast.success('Prompt 已删除')
      setDeleteCandidateId('')
      await load(initialFilters)
    }
    catch (reason) {
      setActionError(errorMessage(reason, `“${prompt.title}”删除失败`))
    }
  }

  const prompts = data?.list ?? []
  const categories = useMemo(() => data?.categories ?? [], [data])
  const communityDrafts = prompts.filter(prompt => prompt.submission_origin === 'community' && prompt.status === 'draft' && prompt.submitted_at).length

  return (
    <>
      <Card className="admin-flat-panel overflow-hidden">
        <Card.Header className="p-0">
          <AdminSectionHeader
            title="Prompts"
            actions={(
              <>
                <Link href="/admin/prompts/categories" className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-bold hover:bg-surface-secondary">分类管理</Link>
                <Button size="sm" variant="secondary" onPress={importer.open}>
                  <FileZipper />
                  导入 ZIP
                </Button>
                <Button size="sm" onPress={openCreate}>
                  <Plus />
                  新建 Prompt
                </Button>
              </>
            )}
            description={(
              <>
                管理提示词、样式和多媒体方案，共
                {data?.total ?? 0}
                {' 条；当前列表有 '}
                {communityDrafts}
                {' 条社区投稿待发布。'}
              </>
            )}
          />
        </Card.Header>
        {actionError
          ? (
              <div aria-live="assertive" className="pb-3">
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>操作未完成</Alert.Title>
                    <Alert.Description>{actionError}</Alert.Description>
                  </Alert.Content>
                  <Button size="sm" variant="danger" onPress={() => setActionError(null)}>关闭</Button>
                </Alert>
              </div>
            )
          : null}
        <Card.Content className="admin-filter-bar px-0">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submitSearch()
            }}
            className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_144px_144px_144px_auto_auto]"
          >
            <SearchField aria-label="搜索 Prompts" variant="secondary" value={query} onChange={value => setQueryDraft({ source: initialFilters.query, value })}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input maxLength={100} placeholder="标题、简介或标签…" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <FilterSelect allLabel="全部类型" options={PROMPT_CONTENT_KINDS.map(item => ({ label: item.label, value: item.value }))} value={initialFilters.kind} onChange={kind => navigate({ ...initialFilters, kind, page: 1 })} />
            <FilterSelect allLabel="全部状态" options={[{ label: '草稿', value: 'draft' }, { label: '已发布', value: 'published' }, { label: '已归档', value: 'archived' }]} value={initialFilters.status} onChange={status => navigate({ ...initialFilters, page: 1, status })} />
            <FilterSelect allLabel="全部来源" options={[{ label: '社区投稿', value: 'community' }, { label: '后台创建', value: 'admin' }]} value={initialFilters.origin} onChange={origin => navigate({ ...initialFilters, origin, page: 1 })} />
            <Button type="submit" size="sm" isPending={loading}>
              {loading ? <Spinner color="current" size="sm" /> : <Magnifier />}
              查询
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isDisabled={loading}
              onPress={reset}
            >
              <ArrowRotateLeft />
              重置
            </Button>
          </form>
        </Card.Content>
        <Card.Content className="p-0">
          {error
            ? (
                <div className="p-4">
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Prompts 加载失败</Alert.Title>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" onPress={() => void load(initialFilters).catch(() => {})}>重试</Button>
                  </Alert>
                </div>
              )
            : loading && !data
              ? <div className="grid min-h-72 place-items-center"><Spinner /></div>
              : !prompts.length
                  ? <EmptyContent />
                  : (
                      <Table variant="secondary" className={loading ? 'opacity-70' : undefined}>
                        <Table.ScrollContainer>
                          <Table.Content aria-label="Prompts 列表" className="admin-prompts-table min-w-[1120px]">
                            <Table.Header>
                              <Table.Column id="prompt" isRowHeader className="admin-prompts-column admin-prompts-column--prompt">Prompt</Table.Column>
                              <Table.Column id="kind" className="admin-prompts-column admin-prompts-column--kind">类型</Table.Column>
                              <Table.Column id="metadata" className="admin-prompts-column admin-prompts-column--metadata">标签与兼容</Table.Column>
                              <Table.Column id="status" className="admin-prompts-column admin-prompts-column--status">状态</Table.Column>
                              <Table.Column id="updated" className="admin-prompts-column admin-prompts-column--updated">更新时间</Table.Column>
                              <Table.Column id="actions" className="admin-prompts-column admin-prompts-column--actions">操作</Table.Column>
                            </Table.Header>
                            <Table.Body>
                              {prompts.map(prompt => (
                                <PromptRow
                                  key={prompt.id}
                                  prompt={prompt}
                                  onEdit={() => void openEdit(prompt.id)}
                                  onRemove={() => void remove(prompt)}
                                  onStatus={() => void changeStatus(prompt)}
                                />
                              ))}
                            </Table.Body>
                          </Table.Content>
                        </Table.ScrollContainer>
                      </Table>
                    )}
        </Card.Content>
        {(data?.total ?? 0) > 0
          ? (
              <Card.Footer className="border-t border-border px-4 py-3">
                <AdminListPagination
                  loading={loading}
                  page={initialFilters.page}
                  pageSize={PAGE_SIZE}
                  total={data?.total ?? 0}
                  onPageChange={page => navigate({ ...initialFilters, page })}
                />
              </Card.Footer>
            )
          : null}
      </Card>
      {editor.isOpen
        ? (
            <PromptEditor
              key={selected?.id ?? 'new'}
              categories={categories}
              initial={selected}
              loadingInitial={loadingDetail}
              state={editor}
              onClosed={requestedEditId && requestedReturnHref ? () => router.replace(requestedReturnHref) : undefined}
              onSaved={() => void load(initialFilters).catch(() => {})}
            />
          )
        : null}
      {importer.isOpen ? <PromptImportModal categories={categories} state={importer} onCommitted={() => void load(initialFilters).catch(() => {})} /> : null}
    </>
  )
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function FilterSelect({ allLabel, onChange, options, value }: { allLabel: string, onChange: (value: string) => void, options: Array<{ label: string, value: string }>, value: string }) {
  return (
    <Select aria-label={allLabel} variant="secondary" value={value} onChange={key => onChange(String(key))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="all" textValue={allLabel}>
            {allLabel}
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

function PromptRow({ onEdit, onRemove, onStatus, prompt }: { onEdit: VoidFunction, onRemove: VoidFunction, onStatus: VoidFunction, prompt: Prompt }) {
  const kind = PROMPT_CONTENT_KINDS.find(item => item.value === prompt.content_kind)
  const status = prompt.status === 'draft' && prompt.submission_origin === 'community'
    ? { color: 'warning' as const, label: prompt.submitted_at ? '待发布' : '上传中' }
    : { archived: { color: 'default' as const, label: '已归档' }, draft: { color: 'warning' as const, label: '后台草稿' }, published: { color: 'success' as const, label: '已发布' } }[prompt.status]
  const statusActionLabel = prompt.status === 'draft' ? '发布' : prompt.status === 'published' ? '归档' : '恢复'
  const categories = prompt.categories.map(category => category.name).join(' · ') || '未分类'
  const tags = prompt.tags.join(' · ') || '暂无标签'
  const compatibility = prompt.compatibility.join(' / ') || '通用'

  return (
    <Table.Row id={prompt.id}>
      <Table.Cell>
        <div className="admin-prompt-resource flex min-w-0 items-center gap-3">
          <div aria-hidden="true" className={`prompt-kind-mark is-${prompt.content_kind}`}>{prompt.title.slice(0, 1).toUpperCase() || <MagicWand />}</div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 title={prompt.title} className="admin-prompt-title truncate">{prompt.title}</h3>
              {prompt.featured ? <StarFill aria-label="精选 Prompt" className="size-3.5 shrink-0 text-warning" /> : null}
              {prompt.submission_origin === 'community' ? <Chip size="sm" variant="secondary">社区</Chip> : null}
            </div>
            <p title={prompt.summary} className="admin-prompt-summary truncate">{prompt.summary}</p>
            <p title={`${categories} /${prompt.slug}`} className="admin-prompt-taxonomy truncate">
              {categories}
              <span aria-hidden="true"> · </span>
              <span className="font-mono">
                /
                {prompt.slug}
              </span>
            </p>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell><Chip size="sm" variant="secondary">{kind?.label ?? '其他'}</Chip></Table.Cell>
      <Table.Cell>
        <div className="admin-prompt-metadata min-w-0">
          <p title={tags} className="truncate">{tags}</p>
          <p title={compatibility} className="truncate text-muted">{compatibility}</p>
        </div>
      </Table.Cell>
      <Table.Cell><Chip color={status.color} size="sm" variant="soft">{status.label}</Chip></Table.Cell>
      <Table.Cell>
        <div className="admin-prompt-updated whitespace-nowrap text-muted">
          <p>{prompt.submitted_at ? `投稿 ${formatDate(prompt.submitted_at)}` : `排序 ${prompt.sort}`}</p>
          <p>
            更新
            {' '}
            {formatDate(prompt.updated_at)}
          </p>
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="secondary" onPress={onEdit}>
            <PencilToSquare aria-hidden="true" />
            编辑
          </Button>
          <Dropdown>
            <Button aria-label={`更多操作：${prompt.title}`} size="sm" variant="tertiary" isIconOnly>
              <Ellipsis aria-hidden="true" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={`${prompt.title} 行操作`}
                onAction={(key) => {
                  if (key === 'status')
                    onStatus()
                  if (key === 'delete')
                    onRemove()
                }}
              >
                <Dropdown.Item id="status" textValue={statusActionLabel}>
                  {prompt.status === 'draft' ? <Check aria-hidden="true" className="size-4 text-muted" /> : <Archive aria-hidden="true" className="size-4 text-muted" />}
                  <Label>{statusActionLabel}</Label>
                </Dropdown.Item>
                {prompt.status !== 'published'
                  ? (
                      <Dropdown.Item id="delete" variant="danger" textValue="删除">
                        <TrashBin aria-hidden="true" className="size-4 text-danger" />
                        <Label>删除</Label>
                      </Dropdown.Item>
                    )
                  : null}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </Table.Cell>
    </Table.Row>
  )
}

function toPayload(prompt: PromptDetail, status: PromptStatus): PromptSaveInput {
  return { categoryIds: prompt.categories.map(category => category.id), compatibility: prompt.compatibility, contentKind: prompt.content_kind, documents: prompt.documents.map(document => ({ content: document.content, isPrimary: document.is_primary, language: document.language, name: document.name, role: document.role, sourcePath: document.source_path })), featured: prompt.featured, primaryCategoryId: prompt.primary_category_id, slug: prompt.slug, sort: prompt.sort, status, summary: prompt.summary, tags: prompt.tags, title: prompt.title }
}

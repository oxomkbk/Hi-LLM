'use client'

import {
  Archive,
  ArrowRotateLeft,
  Check,
  Clock,
  Code,
  Ellipsis,
  MagicWand,
  Magnifier,
  PencilToSquare,
  Plus,
  SealCheck,
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
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { formatDate, RESPONSE } from '@/lib/utils'

import AdminListPagination from '../../admin-list-pagination'
import { AdminSectionHeader } from '../../admin-ui'
import SecurityStatusCell from '../../security/security-status-cell'
import { isCheckableGitSource } from '../../security/source-check-model'
import SourceLinkStatus from '../../security/source-link-status'
import { useSourceChecks } from '../../security/use-source-checks'
import { CATEGORY_OPTIONS, SKILL_STATUS_META, SKILL_STATUS_OPTIONS } from '../shared/meta'
import SkillDeleteDialog from './delete-dialog'
import { skillAdminListHref, skillAdminRequestParams } from './list-model'

import type { SkillAdminListFilters } from './list-model'
import type { PaginatingResponse, Skill, SkillSaveParams, SkillStatus } from '@/types'

const PAGE_SIZE = 20
const DEFAULT_FILTERS: SkillAdminListFilters = {
  category: 'all',
  page: 1,
  q: '',
  status: 'all',
}

const NEXT_STATUS: Record<SkillStatus, SkillStatus> = {
  archived: 'draft',
  draft: 'published',
  published: 'archived',
}

const NEXT_STATUS_ACTION: Record<SkillStatus, { icon: typeof Archive, label: string }> = {
  archived: { icon: Clock, label: '恢复草稿' },
  draft: { icon: Check, label: '发布' },
  published: { icon: Archive, label: '归档' },
}

export default function PublishedSkills({ initialFilters = DEFAULT_FILTERS }: { initialFilters?: SkillAdminListFilters }) {
  const router = useRouter()
  const [queryDraft, setQueryDraft] = useState({
    source: initialFilters.q,
    value: initialFilters.q,
  })
  const [selected, setSelected] = useState<Skill | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const sourceChecks = useSourceChecks()
  const deleteState = useOverlayState()
  const query = queryDraft.source === initialFilters.q ? queryDraft.value : initialFilters.q
  const listHref = skillAdminListHref(initialFilters)

  const { data, error, loading, run } = useRequest<PaginatingResponse<Skill>>('/skills', {
    manual: true,
  })
  const skills = useMemo(() => data?.list ?? [], [data])
  const total = data?.total ?? 0

  const load = useCallback(async (filters: SkillAdminListFilters) => {
    const result = await run(skillAdminRequestParams(filters, PAGE_SIZE))
    const normalizedPage = normalizeAdminPage(filters.page, result.data?.total ?? 0, PAGE_SIZE)

    if (normalizedPage !== filters.page)
      router.replace(skillAdminListHref({ ...filters, page: normalizedPage }), { scroll: false })

    return result
  }, [router, run])

  useEffect(() => {
    void load({
      category: initialFilters.category,
      page: initialFilters.page,
      q: initialFilters.q,
      status: initialFilters.status,
    }).catch(() => {})
  }, [initialFilters.category, initialFilters.page, initialFilters.q, initialFilters.status, load])

  const { loading: statusLoading, run: updateSkill } = useRequest<Skill>('/skills', {
    method: 'PUT',
    manual: true,
  })
  const { loading: deleteLoading, run: deleteSkill } = useRequest('/skills', {
    method: 'DELETE',
    manual: true,
  })

  const navigate = (filters: SkillAdminListFilters) => {
    const href = skillAdminListHref(filters)
    if (href === listHref)
      void load(filters).catch(() => {})
    else
      router.replace(href, { scroll: false })
  }

  const search = () => {
    const nextQuery = query.trim().slice(0, 100)
    setQueryDraft({ source: nextQuery, value: nextQuery })
    navigate({ ...initialFilters, page: 1, q: nextQuery })
  }

  const reset = () => {
    setQueryDraft({ source: '', value: '' })
    navigate({ category: 'all', page: 1, q: '', status: 'all' })
  }

  const openCreate = () => {
    router.push(buildContextualHref('/admin/skills/new', listHref))
  }

  const openEdit = (skill: Skill) => {
    router.push(buildContextualHref(`/admin/skills/${skill.id}/edit`, listHref))
  }

  const updateStatus = async (skill: Skill) => {
    const nextStatus = NEXT_STATUS[skill.status]
    setUpdatingId(skill.id)
    try {
      const result = await updateSkill(skill.id, toSkillPayload(skill, nextStatus)).catch(() => null)
      if (result?.code === RESPONSE.SUCCESS) {
        toast.success(`已切换为${SKILL_STATUS_META[nextStatus].label}`)
        await load(initialFilters)
      }
    }
    finally {
      setUpdatingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!selected)
      return

    const result = await deleteSkill(selected.id).catch(() => null)
    if (result?.code === RESPONSE.SUCCESS) {
      toast.success('Skill 已删除')
      deleteState.close()
      setSelected(null)
      await load(initialFilters)
    }
  }

  return (
    <>
      <Card className="admin-flat-panel overflow-hidden">
        <Card.Header className="p-0">
          <AdminSectionHeader
            title="Skills"
            actions={(
              <>
                <span data-tone="neutral" className="admin-ui-status">
                  共
                  {' '}
                  {total}
                  {' '}
                  条
                </span>
                <Button size="sm" onPress={openCreate}>
                  <Plus />
                  新增 Skill
                </Button>
              </>
            )}
            description="管理已收录能力、发布状态、分类与安全评测"
          />
        </Card.Header>

        <Card.Content className="admin-filter-bar px-0">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              search()
            }}
            className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_160px_auto_auto]"
          >
            <SearchField aria-label="搜索 Skills" variant="secondary" value={query} onChange={value => setQueryDraft({ source: initialFilters.q, value })}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input maxLength={100} placeholder="名称、摘要、作者…" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            <Select
              aria-label="发布状态"
              variant="secondary"
              value={initialFilters.status}
              onChange={value => navigate({ ...initialFilters, page: 1, status: value as SkillAdminListFilters['status'] })}
            >
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
                  {SKILL_STATUS_OPTIONS.map(option => (
                    <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                      {option.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <Select
              aria-label="Skill 分类"
              variant="secondary"
              value={initialFilters.category}
              onChange={value => navigate({ ...initialFilters, category: String(value), page: 1 })}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all" textValue="全部分类">
                    全部分类
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  {CATEGORY_OPTIONS.map(option => (
                    <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                      {option.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <Button type="submit" size="sm" isPending={loading}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <Magnifier />}
                  查询
                </>
              )}
            </Button>
            <Button type="button" size="sm" variant="secondary" isDisabled={loading} onPress={reset}>
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
                      <Alert.Title>Skills 数据加载失败</Alert.Title>
                      <Alert.Description>请检查接口或数据库配置后重试。</Alert.Description>
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
                      <Table.Content aria-label="Skills 管理列表" className="admin-skills-table min-w-[1080px]">
                        <Table.Header>
                          <Table.Column id="skill" isRowHeader className="admin-skills-column admin-skills-column--resource">Skill</Table.Column>
                          <Table.Column id="status" className="admin-skills-column admin-skills-column--status">状态</Table.Column>
                          <Table.Column id="source" className="admin-skills-column admin-skills-column--source">来源 / 作者</Table.Column>
                          <Table.Column id="security" className="admin-skills-column admin-skills-column--security">安全评测</Table.Column>
                          <Table.Column id="updated" className="admin-skills-column admin-skills-column--updated">最后更新</Table.Column>
                          <Table.Column id="actions" className="admin-skills-column admin-skills-column--actions">操作</Table.Column>
                        </Table.Header>
                        <Table.Body renderEmptyState={() => <EmptyContent />}>
                          {skills.map((skill) => {
                            const statusMeta = SKILL_STATUS_META[skill.status]
                            const action = NEXT_STATUS_ACTION[skill.status]
                            const ActionIcon = action.icon
                            const isUpdating = statusLoading && updatingId === skill.id
                            const canCheckSource = skill.source_kind === 'git_repository'
                              && isCheckableGitSource(skill.source_url ?? '')
                            const isCheckingSource = sourceChecks.isChecking('skill', skill.id)

                            return (
                              <Table.Row key={skill.id} id={skill.id}>
                                <Table.Cell>
                                  <div className="admin-resource-cell flex min-w-0 items-center gap-3 py-1">
                                    <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-secondary text-sm font-bold">
                                      {skill.name.slice(0, 1).toUpperCase() || <MagicWand />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p title={skill.name} className="max-w-80 truncate text-sm font-semibold">{skill.name}</p>
                                        {skill.featured ? <StarFill aria-label="精选 Skill" className="size-3.5 shrink-0 text-warning" /> : null}
                                        {skill.verified ? <SealCheck aria-label="认证 Skill" className="size-3.5 shrink-0 text-accent" /> : null}
                                        <span className="max-w-40 truncate font-mono text-[10px] text-muted">
                                          /
                                          {skill.slug}
                                        </span>
                                      </div>
                                      <p title={skill.summary} className="mt-0.5 max-w-[480px] truncate text-xs text-muted">{skill.summary}</p>
                                      <div className="mt-1.5 flex items-center gap-1.5">
                                        <Chip size="sm" variant="secondary">{skill.category}</Chip>
                                        {skill.platforms.slice(0, 2).map(platform => <Chip key={platform} size="sm" variant="soft">{platform}</Chip>)}
                                        {skill.platforms.length > 2
                                          ? (
                                              <span className="text-[11px] text-muted">
                                                +
                                                {skill.platforms.length - 2}
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
                                    <p title={skill.author_name} className="max-w-40 truncate font-semibold">{skill.author_name}</p>
                                    <div className="mt-1 max-w-44">
                                      <SourceLinkStatus
                                        emptyLabel="站内原创内容"
                                        result={sourceChecks.resultFor('skill', skill.id)}
                                        sourceUrl={skill.source_url}
                                      />
                                    </div>
                                  </div>
                                </Table.Cell>
                                <Table.Cell>
                                  <SecurityStatusCell
                                    grade={skill.security_grade}
                                    reportState={skill.security_report_state}
                                    scanStatus={skill.security_scan_status}
                                    score={skill.security_score}
                                  />
                                </Table.Cell>
                                <Table.Cell>
                                  <div className="whitespace-nowrap text-xs text-muted">
                                    <p>{formatDate(skill.updated_at, 'datetime')}</p>
                                    <p className="mt-0.5">
                                      排序
                                      {' '}
                                      {skill.sort}
                                    </p>
                                  </div>
                                </Table.Cell>
                                <Table.Cell>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="sm" variant="secondary" onPress={() => openEdit(skill)}>
                                      <PencilToSquare aria-hidden="true" />
                                      编辑
                                    </Button>
                                    <Dropdown>
                                      <Button aria-label={`更多操作：${skill.name}`} size="sm" variant="tertiary" isIconOnly>
                                        <Ellipsis aria-hidden="true" />
                                      </Button>
                                      <Dropdown.Popover placement="bottom end">
                                        <Dropdown.Menu
                                          aria-label={`${skill.name} 行操作`}
                                          disabledKeys={isUpdating
                                            ? ['source-check', 'status', 'delete']
                                            : isCheckingSource ? ['source-check'] : []}
                                          onAction={(key) => {
                                            if (key === 'source-check') {
                                              void sourceChecks.check({ subjectId: skill.id, subjectType: 'skill' })
                                            }
                                            if (key === 'status')
                                              void updateStatus(skill)
                                            if (key === 'delete') {
                                              setSelected(skill)
                                              deleteState.open()
                                            }
                                          }}
                                        >
                                          {canCheckSource
                                            ? (
                                                <Dropdown.Item id="source-check" textValue="检查来源">
                                                  <Code aria-hidden="true" className="size-4 text-muted" />
                                                  <Label>{isCheckingSource ? '检查中' : '检查来源'}</Label>
                                                </Dropdown.Item>
                                              )
                                            : null}
                                          <Dropdown.Item id="status" textValue={action.label}>
                                            <ActionIcon aria-hidden="true" className="size-4 text-muted" />
                                            <Label>{action.label}</Label>
                                          </Dropdown.Item>
                                          <Dropdown.Item id="delete" variant="danger" textValue="删除">
                                            <TrashBin aria-hidden="true" className="size-4 text-danger" />
                                            <Label>删除</Label>
                                          </Dropdown.Item>
                                        </Dropdown.Menu>
                                      </Dropdown.Popover>
                                    </Dropdown>
                                  </div>
                                </Table.Cell>
                              </Table.Row>
                            )
                          })}
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
                  page={initialFilters.page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPageChange={page => navigate({ ...initialFilters, page })}
                />
              </Card.Footer>
            )
          : null}
      </Card>

      <SkillDeleteDialog
        loading={deleteLoading}
        skill={selected}
        state={deleteState}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function toSkillPayload(skill: Skill, status: SkillStatus = skill.status): Record<string, unknown> {
  return {
    author_name: skill.author_name,
    author_url: skill.author_url,
    category: skill.category,
    description: skill.description,
    featured: skill.featured,
    homepage_url: skill.homepage_url,
    icon: skill.icon,
    install_command: skill.install_command,
    license: skill.license,
    name: skill.name,
    platforms: skill.platforms,
    slug: skill.slug,
    sort: skill.sort,
    source_kind: skill.source_kind,
    source_url: skill.source_url,
    status,
    summary: skill.summary,
    tags: skill.tags,
    verified: skill.verified,
    version: skill.version,
  } satisfies SkillSaveParams
}

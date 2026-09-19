'use client'

import {
  ArrowRight,
  ArrowRotateLeft,
  Check,
  Clock,
  Comments,
  Cubes3,
  Eye,
  Magnifier,
  Pencil,
  Person,
  PersonPlus,
  TrashBin,
  Xmark,
} from '@gravity-ui/icons'
import {
  AlertDialog,
  Avatar,
  Button,
  Chip,
  Drawer,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Spinner,
  Switch,
  Table,
  TextField,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import EmptyContent from '@/components/EmptyContent'
import useRequest from '@/hooks/use-request'
import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'
import { formatDate, RESPONSE } from '@/lib/utils'

import { AdminPageHeader } from './admin-ui'

import type {
  AdminUser,
  AdminUserListResponse,
  AdminUserRole,
  AdminUserSaveInput,
  AdminUserStatus,
} from '@/types'
import type { ComponentType, FormEvent } from 'react'

const PAGE_SIZE = 20
const ROLE_OPTIONS: { id: AdminUserRole | 'all', label: string }[] = [
  { id: 'all', label: '全部角色' },
  { id: 'admin', label: '管理员' },
  { id: 'user', label: '普通用户' },
]
const STATUS_OPTIONS: { id: AdminUserStatus | 'all', label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'active', label: '正常' },
  { id: 'disabled', label: '已停用' },
]

export default function UserManagement() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<AdminUserRole | 'all'>('all')
  const [status, setStatus] = useState<AdminUserStatus | 'all'>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [focusedUser, setFocusedUser] = useState<AdminUser | null>(null)
  const detailState = useOverlayState()
  const editorState = useOverlayState()
  const deleteState = useOverlayState()
  const paramsRef = useRef({ pageIndex: 0, pageSize: PAGE_SIZE, q: '', role: '', status: '' })

  const { data, error, loading, run } = useRequest<AdminUserListResponse>('/admin/users', { manual: true })
  const { loading: creating, run: create } = useRequest<{ id: string }>('/admin/users', { method: 'POST', manual: true })
  const { loading: updating, run: update } = useRequest<{ id: string }>('/admin/users', { method: 'PUT', manual: true })
  const { loading: deleting, run: remove } = useRequest<{ id: string }>('/admin/users', { method: 'DELETE', manual: true })
  const users = useMemo(() => data?.list ?? [], [data])
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const saving = creating || updating

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
      q,
      role: role === 'all' ? '' : role,
      status: status === 'all' ? '' : status,
    }).catch(() => {})
  }

  const reset = () => {
    setQ('')
    setRole('all')
    setStatus('all')
    setPageIndex(0)
    void load({ pageIndex: 0, q: '', role: '', status: '' }).catch(() => {})
  }

  const openCreate = () => {
    setSelected(null)
    editorState.open()
  }

  const openEdit = (user: AdminUser) => {
    setSelected(user)
    editorState.open()
  }

  const openDetails = (user: AdminUser) => {
    setFocusedUser(user)
    detailState.open()
  }

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const editingSelf = selected?.id === data?.currentUserId
    const payload: AdminUserSaveInput = {
      canAnswer: formData.has('canAnswer'),
      canAsk: formData.has('canAsk'),
      canComment: formData.has('canComment'),
      canPublishWorks: formData.has('canPublishWorks'),
      canUpload: formData.has('canUpload'),
      email: String(formData.get('email') ?? ''),
      emailVerified: editingSelf ? Boolean(selected?.emailVerified) : formData.has('emailVerified'),
      image: String(formData.get('image') ?? ''),
      name: String(formData.get('name') ?? ''),
      password: String(formData.get('password') ?? '') || undefined,
      role: String(formData.get('role') ?? 'user') as AdminUserRole,
      status: String(formData.get('status') ?? 'active') as AdminUserStatus,
    }

    const result = selected
      ? await update(selected.id, payload).catch(() => null)
      : await create(payload).catch(() => null)
    if (result?.code !== RESPONSE.SUCCESS)
      return

    toast.success(selected ? '用户资料已更新' : '用户已创建')
    editorState.close()
    setSelected(null)
    await load()
    if (editingSelf)
      router.refresh()
  }

  const confirmDelete = async () => {
    if (!selected)
      return
    const result = await remove(selected.id).catch(() => null)
    if (result?.code !== RESPONSE.SUCCESS)
      return

    toast.success('用户已删除')
    deleteState.close()
    setSelected(null)
    const nextPage = users.length === 1 && pageIndex > 0 ? pageIndex - 1 : pageIndex
    setPageIndex(nextPage)
    await load({ pageIndex: nextPage })
  }

  return (
    <>
      <div className="admin-user-workspace">
        <AdminPageHeader
          title="用户管理"
          actions={(
            <Button onPress={openCreate}>
              <PersonPlus />
              新增用户
            </Button>
          )}
          description="查看账号状态、登录活跃度、社区贡献与功能权限。"
        />

        <section aria-label="用户指标" className="admin-user-summary">
          <UserSummaryMetric detail={`${data?.summary.administrators ?? 0} 位管理员`} label="全部用户" value={data?.summary.total ?? 0} />
          <UserSummaryMetric detail={`${data?.summary.disabled ?? 0} 个已停用`} label="正常账号" value={data?.summary.active ?? 0} />
          <UserSummaryMetric detail="基于最近会话" label="7 天活跃" value={data?.summary.activeLast7Days ?? 0} />
          <UserSummaryMetric detail="新注册用户" label="30 天新增" value={data?.summary.newLast30Days ?? 0} />
        </section>

        <section className="admin-data-view admin-user-directory">
          <div className="admin-user-filterbar flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-2 sm:grid-cols-[minmax(210px,1fr)_140px_140px_auto_auto] xl:min-w-[720px]">
              <SearchField
                aria-label="搜索用户"
                variant="secondary"
                value={q}
                onChange={setQ}
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    search()
                }}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="姓名或邮箱" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <FilterSelect ariaLabel="用户角色" options={ROLE_OPTIONS} value={role} onChange={value => setRole(value as typeof role)} />
              <FilterSelect ariaLabel="用户状态" options={STATUS_OPTIONS} value={status} onChange={value => setStatus(value as typeof status)} />
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
            <span className="self-start text-xs text-muted xl:self-auto">
              当前结果
              {data?.total ?? 0}
              {' '}
              人
            </span>
          </div>

          {error
            ? (
                <div className="grid min-h-64 place-items-center text-center text-sm text-muted">
                  <div>
                    <p>用户加载失败</p>
                    <Button size="sm" variant="secondary" onPress={() => void load().catch(() => {})} className="mt-3">重试</Button>
                  </div>
                </div>
              )
            : loading && !data
              ? <div className="grid min-h-64 place-items-center"><Spinner /></div>
              : (
                  <Table variant="secondary" className="mt-3">
                    <Table.ScrollContainer>
                      <Table.Content aria-label="后台用户列表">
                        <Table.Header>
                          <Table.Column id="user" isRowHeader>用户</Table.Column>
                          <Table.Column id="account">账号状态</Table.Column>
                          <Table.Column id="activity">最近活跃</Table.Column>
                          <Table.Column id="contribution">社区贡献</Table.Column>
                          <Table.Column id="permissions">社区权限</Table.Column>
                          <Table.Column id="created">注册时间</Table.Column>
                          <Table.Column id="actions">操作</Table.Column>
                        </Table.Header>
                        <Table.Body renderEmptyState={() => <EmptyContent />}>
                          {users.map(user => (
                            <Table.Row key={user.id} id={user.id}>
                              <Table.Cell>
                                <div className="flex min-w-64 items-center gap-3">
                                  <Avatar size="md">
                                    {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
                                    <Avatar.Fallback><Person className="size-4" /></Avatar.Fallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                      <span className="truncate">{user.name}</span>
                                      {user.id === data?.currentUserId ? <Chip size="sm" variant="soft">当前账号</Chip> : null}
                                    </p>
                                    <p className="mt-0.5 max-w-72 truncate text-[11px] text-muted">{user.email}</p>
                                    <p className="mt-1 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                                      {user.role === 'admin' ? 'Administrator' : 'Member'}
                                    </p>
                                  </div>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex min-w-28 flex-col items-start gap-1.5">
                                  <Chip color={user.status === 'active' ? 'success' : 'danger'} size="sm" variant="soft">
                                    {user.status === 'active' ? '正常' : '已停用'}
                                  </Chip>
                                  <span className={`flex items-center gap-1 text-[11px] ${user.emailVerified ? 'text-success' : 'text-muted'}`}>
                                    {user.emailVerified ? <Check className="size-3" /> : <Xmark className="size-3" />}
                                    {user.emailVerified ? '邮箱已验证' : '邮箱未验证'}
                                  </span>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="min-w-32 text-xs">
                                  <p className="font-medium">{user.lastSessionAt ? relativeTime(user.lastSessionAt) : '尚未登录'}</p>
                                  <p className="mt-1 text-[11px] text-muted">
                                    {user.sessionCount > 0 ? `${user.sessionCount} 个有效会话` : formatLoginMethods(user.loginMethods)}
                                  </p>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="min-w-36">
                                  <p className="font-mono text-sm font-semibold tabular-nums">{user.activity.total}</p>
                                  <p className="mt-1 text-[11px] text-muted">
                                    问
                                    {' '}
                                    {user.activity.questions}
                                    {' '}
                                    · 答
                                    {' '}
                                    {user.activity.answers}
                                    {' '}
                                    · 作
                                    {' '}
                                    {user.activity.works}
                                  </p>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex min-w-36 flex-wrap gap-1">
                                  <CapabilityChip enabled={user.canAsk || user.role === 'admin'} label="问" />
                                  <CapabilityChip enabled={user.canAnswer || user.role === 'admin'} label="答" />
                                  <CapabilityChip enabled={user.canComment || user.role === 'admin'} label="评" />
                                  <CapabilityChip enabled={user.canPublishWorks || user.role === 'admin'} label="作" />
                                  <CapabilityChip enabled={user.canUpload || user.role === 'admin'} label="图" />
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="min-w-32 text-xs">
                                  <p>{formatDate(user.createdAt, 'datetime')}</p>
                                  <p className="mt-1 text-[11px] text-muted">
                                    更新于
                                    {relativeTime(user.updatedAt)}
                                  </p>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center gap-1">
                                  <Button aria-label={`查看 ${user.name} 详情`} size="sm" variant="ghost" isIconOnly onPress={() => openDetails(user)}>
                                    <Eye />
                                  </Button>
                                  <Button aria-label={`编辑 ${user.name}`} size="sm" variant="ghost" isIconOnly onPress={() => openEdit(user)}>
                                    <Pencil />
                                  </Button>
                                  <Button
                                    aria-label={`删除 ${user.name}`}
                                    size="sm"
                                    variant="ghost"
                                    isDisabled={user.id === data?.currentUserId}
                                    isIconOnly
                                    onPress={() => {
                                      setSelected(user)
                                      deleteState.open()
                                    }}
                                    className="text-danger"
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

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted">
              共
              {data?.total ?? 0}
              {' '}
              个用户 · 第
              {pageIndex + 1}
              /
              {pageCount}
              {' '}
              页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pageIndex <= 0 || loading}
                onPress={() => {
                  const next = pageIndex - 1
                  setPageIndex(next)
                  void load({ pageIndex: next }).catch(() => {})
                }}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pageIndex + 1 >= pageCount || loading}
                onPress={() => {
                  const next = pageIndex + 1
                  setPageIndex(next)
                  void load({ pageIndex: next }).catch(() => {})
                }}
              >
                下一页
              </Button>
            </div>
          </div>
        </section>
      </div>

      <UserDetailDrawer
        currentUserId={data?.currentUserId ?? ''}
        state={detailState}
        user={focusedUser}
        onEdit={() => {
          if (!focusedUser)
            return
          detailState.close()
          openEdit(focusedUser)
        }}
      />

      <UserEditor
        currentUserId={data?.currentUserId ?? ''}
        loading={saving}
        selected={selected}
        state={editorState}
        onSubmit={saveUser}
      />

      <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={deleteState.isOpen} onOpenChange={deleteState.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={deleteState.close} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>永久删除用户？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="font-medium">{selected?.name}</p>
              <p className="mt-1 break-all text-sm text-muted">{selected?.email}</p>
              <p className="mt-3 text-sm">账号、密码和全部登录会话都会删除，操作无法恢复。优先使用“停用”保留历史记录。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" isDisabled={deleting} slot="close" onPress={deleteState.close}>取消</Button>
              <Button variant="danger" isPending={deleting} onPress={() => void confirmDelete()}>
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : <TrashBin />}
                    {isPending ? '删除中…' : '永久删除'}
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

function CapabilityChip({ enabled, label }: { enabled: boolean, label: string }) {
  return <Chip color={enabled ? 'success' : 'danger'} size="sm" variant="soft">{label}</Chip>
}

function ContributionMetric({ icon: Icon, label, value }: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div>
      <Icon />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FilterSelect({ ariaLabel, onChange, options, value }: {
  ariaLabel: string
  onChange: (value: string) => void
  options: { id: string, label: string }[]
  value: string
}) {
  return (
    <Select aria-label={ariaLabel} variant="secondary" value={value} onChange={next => onChange(String(next))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(option => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function formatLoginMethods(methods: string[]) {
  if (!methods.length)
    return '未绑定登录方式'
  return methods.map((method) => {
    if (method === 'credential')
      return '密码'
    if (method === 'google')
      return 'Google'
    if (method === 'github')
      return 'GitHub'
    return method
  }).join(' · ')
}

function PermissionStatus({ enabled, label }: { enabled: boolean, label: string }) {
  return (
    <span className={enabled ? 'is-enabled' : 'is-disabled'}>
      {enabled ? <Check /> : <Xmark />}
      {label}
    </span>
  )
}

function PermissionSwitch({ description, enabled, label, name }: {
  description: string
  enabled: boolean
  label: string
  name: string
}) {
  return (
    <Switch name={name} defaultSelected={enabled} value="true">
      <Switch.Content className="items-start">
        <Switch.Control><Switch.Thumb /></Switch.Control>
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="mt-0.5 block text-[11px] text-muted">{description}</span>
        </span>
      </Switch.Content>
    </Switch>
  )
}

function relativeTime(value: string) {
  const difference = new Date(value).getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ]
  const range = ranges.find(([, duration]) => Math.abs(difference) >= duration)
  if (!range)
    return '刚刚'
  return formatter.format(Math.round(difference / range[1]), range[0])
}

function UserDetailDrawer({ currentUserId, onEdit, state, user }: {
  currentUserId: string
  onEdit: () => void
  state: ReturnType<typeof useOverlayState>
  user: AdminUser | null
}) {
  const isAdmin = user?.role === 'admin'
  return (
    <Drawer.Backdrop variant="blur" isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="admin-user-detail w-[min(31rem,94vw)]">
          <Drawer.CloseTrigger aria-label="关闭用户详情" onPress={state.close} />
          <Drawer.Header className="admin-user-detail-header">
            {user
              ? (
                  <div className="flex min-w-0 items-center gap-3 pr-10">
                    <Avatar size="lg">
                      {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
                      <Avatar.Fallback><Person /></Avatar.Fallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Drawer.Heading className="truncate">{user.name}</Drawer.Heading>
                      <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
                    </div>
                  </div>
                )
              : <Drawer.Heading>用户详情</Drawer.Heading>}
          </Drawer.Header>
          <Drawer.Body className="admin-user-detail-body">
            {user
              ? (
                  <>
                    <div className="admin-user-detail-state">
                      <Chip color={user.status === 'active' ? 'success' : 'danger'} size="sm" variant="soft">
                        {user.status === 'active' ? '账号正常' : '账号已停用'}
                      </Chip>
                      <Chip color={isAdmin ? 'accent' : 'default'} size="sm" variant="soft">
                        {isAdmin ? '管理员' : '普通用户'}
                      </Chip>
                      {user.id === currentUserId ? <Chip size="sm" variant="soft">当前账号</Chip> : null}
                    </div>

                    <section className="admin-user-detail-section">
                      <h3>账号与登录</h3>
                      <dl className="admin-user-detail-list">
                        <div>
                          <dt>邮箱状态</dt>
                          <dd>{user.emailVerified ? '已验证' : '未验证'}</dd>
                        </div>
                        <div>
                          <dt>登录方式</dt>
                          <dd>{formatLoginMethods(user.loginMethods)}</dd>
                        </div>
                        <div>
                          <dt>有效会话</dt>
                          <dd>
                            {user.sessionCount}
                            {' '}
                            个
                          </dd>
                        </div>
                        <div>
                          <dt>最近登录</dt>
                          <dd>{user.lastSessionAt ? formatDate(user.lastSessionAt, 'datetime') : '尚未登录'}</dd>
                        </div>
                        <div>
                          <dt>注册时间</dt>
                          <dd>{formatDate(user.createdAt, 'datetime')}</dd>
                        </div>
                        <div>
                          <dt>资料更新</dt>
                          <dd>{formatDate(user.updatedAt, 'datetime')}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="admin-user-detail-section">
                      <h3>社区贡献</h3>
                      <div className="admin-user-contribution-grid">
                        <ContributionMetric icon={Comments} label="问题" value={user.activity.questions} />
                        <ContributionMetric icon={ArrowRight} label="回答" value={user.activity.answers} />
                        <ContributionMetric icon={Cubes3} label="作品" value={user.activity.works} />
                        <ContributionMetric icon={Clock} label="评论" value={user.activity.comments} />
                      </div>
                      <p className="admin-user-last-contribution">
                        共
                        {' '}
                        {user.activity.total}
                        {' '}
                        项贡献
                        {user.activity.lastContributionAt
                          ? (
                              <>
                                {' '}
                                · 最近
                                {relativeTime(user.activity.lastContributionAt)}
                              </>
                            )
                          : ' · 暂无社区活动'}
                      </p>
                    </section>

                    <section className="admin-user-detail-section">
                      <h3>功能权限</h3>
                      <div className="admin-user-permission-list">
                        <PermissionStatus enabled={user.canAsk || isAdmin} label="发布问题" />
                        <PermissionStatus enabled={user.canAnswer || isAdmin} label="发布回答" />
                        <PermissionStatus enabled={user.canComment || isAdmin} label="参与评论" />
                        <PermissionStatus enabled={user.canPublishWorks || isAdmin} label="发布作品" />
                        <PermissionStatus enabled={user.canUpload || isAdmin} label="上传图片" />
                      </div>
                    </section>
                  </>
                )
              : null}
          </Drawer.Body>
          <Drawer.Footer className="admin-user-detail-footer">
            <Button variant="secondary" slot="close" onPress={state.close}>关闭</Button>
            <Button onPress={onEdit}>
              <Pencil />
              {' '}
              编辑用户
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

function UserEditor({ currentUserId, loading, onSubmit, selected, state }: {
  currentUserId: string
  loading: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  selected: AdminUser | null
  state: ReturnType<typeof useOverlayState>
}) {
  const isSelf = selected?.id === currentUserId
  const mode = selected ? '编辑用户' : '新增用户'

  return (
    <Modal.Backdrop
      variant="blur"
      isDismissable={!loading}
      isKeyboardDismissDisabled={loading}
      isOpen={state.isOpen}
      onOpenChange={state.setOpen}
    >
      <Modal.Container size="lg" placement="center" scroll="inside" className="overscroll-contain">
        <Modal.Dialog className="overflow-hidden sm:max-w-2xl">
          <Modal.CloseTrigger aria-label="关闭用户编辑器" onPress={state.close} />
          <Modal.Header className="border-b border-border px-5 py-4 sm:px-6">
            <Modal.Heading>{mode}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4 sm:px-6 sm:py-5">
            <Form key={selected?.id ?? 'create'} id="admin-user-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" isRequired defaultValue={selected?.name ?? ''} maxLength={100}>
                <Label>姓名</Label>
                <Input variant="secondary" autoComplete="off" fullWidth placeholder="用户显示名称" />
                <FieldError />
              </TextField>
              <TextField name="email" type="email" isRequired defaultValue={selected?.email ?? ''} maxLength={254}>
                <Label>邮箱</Label>
                <Input type="email" variant="secondary" autoComplete="off" fullWidth placeholder="name@example.com" />
                <FieldError />
              </TextField>
              <Select
                aria-label="用户角色"
                name="role"
                variant="secondary"
                isRequired
                defaultValue={selected?.role ?? 'user'}
                disabledKeys={isSelf ? ['user'] : []}
              >
                <Label>角色</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="user" textValue="普通用户">
                      普通用户
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="admin" textValue="管理员">
                      管理员
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                aria-label="用户状态"
                name="status"
                variant="secondary"
                isRequired
                defaultValue={selected?.status ?? 'active'}
                disabledKeys={isSelf ? ['disabled'] : []}
              >
                <Label>状态</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="active" textValue="正常">
                      正常
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="disabled" textValue="已停用">
                      已停用
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField name="image" defaultValue={selected?.image ?? ''} maxLength={2048} className="sm:col-span-2">
                <Label>头像地址</Label>
                <Input variant="secondary" autoComplete="off" fullWidth placeholder="https://example.com/avatar.png" />
                <FieldError />
              </TextField>
              <TextField
                name="password"
                isDisabled={isSelf}
                isRequired={!selected}
                maxLength={AUTH_MAX_PASSWORD_LENGTH}
                minLength={AUTH_MIN_PASSWORD_LENGTH}
                className="sm:col-span-2"
              >
                <Label>{selected ? '重置密码（可选）' : '初始密码'}</Label>
                <Input
                  type="password"
                  variant="secondary"
                  autoComplete="new-password"
                  fullWidth
                  placeholder={isSelf ? '请通过账号安全功能修改' : '至少 12 个字符'}
                />
                <FieldError />
              </TextField>
              <div className="sm:col-span-2">
                <Switch name="emailVerified" isDisabled={isSelf} defaultSelected={selected?.emailVerified ?? true} value="true">
                  <Switch.Content>
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                    邮箱已验证
                  </Switch.Content>
                </Switch>
                <p className="mt-1 text-[11px] text-muted">未验证邮箱无法使用密码登录。</p>
              </div>
              <fieldset className="sm:col-span-2 rounded-xl bg-surface-secondary p-4">
                <legend className="px-1 text-xs font-black">妙妙屋社区权限</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <PermissionSwitch name="canAsk" description="允许创建新的问答主题" enabled={selected?.canAsk ?? true} label="发布问题" />
                  <PermissionSwitch name="canAnswer" description="允许回复社区问题" enabled={selected?.canAnswer ?? true} label="发布回答" />
                  <PermissionSwitch name="canComment" description="允许评论问题、回答和新闻" enabled={selected?.canComment ?? true} label="参与评论" />
                  <PermissionSwitch name="canPublishWorks" description="允许向作品广场发布代码作品" enabled={selected?.canPublishWorks ?? true} label="发布作品" />
                  <PermissionSwitch name="canUpload" description="允许在社区内容中绑定图片" enabled={selected?.canUpload ?? true} label="上传图片" />
                </div>
                <p className="mt-3 text-[11px] text-muted">关闭权限或停用账号后会撤销该用户的现有登录会话；管理员角色始终拥有社区操作权限。</p>
              </fieldset>
              {isSelf ? <p className="sm:col-span-2 text-xs text-muted">当前账号不能在这里降权、停用、删除或重置密码。</p> : null}
            </Form>
          </Modal.Body>
          <Modal.Footer className="border-t border-border px-5 py-3 sm:px-6">
            <Button variant="outline" isDisabled={loading} slot="close" onPress={state.close}>取消</Button>
            <Button type="submit" isPending={loading} form="admin-user-form">
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : selected ? <Pencil /> : <PersonPlus />}
                  {isPending ? '保存中…' : '保存'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function UserSummaryMetric({ detail, label, value }: { detail: string, label: string, value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

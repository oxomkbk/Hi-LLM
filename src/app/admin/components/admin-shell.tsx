'use client'

import {
  Bars,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  House,
  ListUl,
  Plus,
  ShieldExclamation,
} from '@gravity-ui/icons'
import { Button, Drawer, Dropdown, Label, useOverlayState } from '@heroui/react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLayoutEffect, useState } from 'react'

import ThemeSwitcher from '@/components/ThemeSwitcher'
import { isEditorWorkspaceRoute } from '@/lib/routes/public-shell'

import AdminAccountMenu from './admin-account-menu'
import AdminCommandCenter from './admin-command-center'
import {
  ADMIN_CREATE_ACTIONS,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  findAdminNavGroup,
  findAdminNavItem,
  nextAdminOpenGroups,
  resolveAdminOpenGroupsPreference,
} from './admin-navigation'

import type { AdminAccountUser } from './admin-account-menu'
import type { AdminNavGroupId, AdminNavItem } from './admin-navigation'
import type { Key, ReactNode } from 'react'

const SIDEBAR_STORAGE_KEY = 'hillm-nav:admin-sidebar-collapsed:v1'
const DENSITY_STORAGE_KEY = 'hillm-nav:admin-density:v1'
const NAV_GROUPS_STORAGE_KEY = 'hillm-nav:admin-nav-groups:v2'

export default function AdminShell({ children, user }: { children: ReactNode, user: AdminAccountUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const mobileNavState = useOverlayState()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable')
  const [sidebarReady, setSidebarReady] = useState(false)
  const current = findAdminNavItem(pathname)
  const currentGroup = findAdminNavGroup(current.group)
  const [openGroups, setOpenGroups] = useState<Set<AdminNavGroupId>>(
    () => new Set<AdminNavGroupId>(['WORKSPACE', 'CONTENT', current.group]),
  )

  useLayoutEffect(() => {
    /* eslint-disable react/set-state-in-effect -- preferences are intentionally restored before first paint */
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
      setDensity(window.localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable')
      const navigationPreference = resolveAdminOpenGroupsPreference(window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY), current.group)
      setOpenGroups(navigationPreference.groups)
      persistPreference(NAV_GROUPS_STORAGE_KEY, navigationPreference.serialized)
    }
    catch {
      setOpenGroups(new Set<AdminNavGroupId>(['WORKSPACE', 'CONTENT', current.group]))
    }
    setSidebarReady(true)
    /* eslint-enable react/set-state-in-effect */
  }, [current.group])

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed
      persistPreference(SIDEBAR_STORAGE_KEY, String(next))
      return next
    })
  }

  const toggleDensity = () => {
    setDensity((currentDensity) => {
      const next = currentDensity === 'compact' ? 'comfortable' : 'compact'
      persistPreference(DENSITY_STORAGE_KEY, next)
      return next
    })
  }

  const toggleNavigationGroup = (target: AdminNavGroupId) => {
    setOpenGroups((currentValue) => {
      const next = nextAdminOpenGroups(currentValue, target)
      persistPreference(NAV_GROUPS_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const handleCreateAction = (key: Key) => {
    const action = ADMIN_CREATE_ACTIONS.find(item => item.id === key)
    if (action) {
      router.push(action.href)
    }
  }

  if (isEditorWorkspaceRoute(pathname))
    return <>{children}</>

  const navigation = (collapsed = false, mobile = false) => (
    <>
      <nav aria-label="后台模块导航" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {ADMIN_NAV_GROUPS.map((group) => {
          const expanded = group.id === 'WORKSPACE' || openGroups.has(group.id)
          return (
            <div key={group.id} className={collapsed ? 'mb-2 last:mb-0' : 'mb-1 last:mb-0'}>
              {collapsed || group.id === 'WORKSPACE'
                ? null
                : (
                    <button
                      aria-expanded={expanded}
                      type="button"
                      onClick={() => toggleNavigationGroup(group.id)}
                      className="admin-nav-group flex h-10 w-full items-center justify-between rounded-lg px-2.5 text-[11px] font-semibold text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                    >
                      <span>{group.label}</span>
                      <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
              <div className={expanded || collapsed ? 'space-y-0.5' : 'hidden'}>
                {ADMIN_NAV_ITEMS.filter(item => item.group === group.id).map(item => (
                  <AdminNavLink
                    key={item.href}
                    active={item.match(pathname)}
                    collapsed={collapsed}
                    item={item}
                    preload={router.prefetch}
                    onNavigate={mobile ? mobileNavState.close : undefined}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="admin-sidebar-footer p-3">
        <Link
          aria-label="返回前台"
          title={collapsed ? '返回前台' : undefined}
          href="/"
          className={`admin-sidebar-home flex h-9 items-center rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${collapsed ? 'justify-center px-0' : 'gap-3 px-2.5'}`}
        >
          <House className="size-4" />
          <span className={collapsed ? 'sr-only' : undefined}>返回前台</span>
        </Link>
      </div>
    </>
  )

  return (
    <div data-density={density} data-sidebar-ready={sidebarReady ? 'true' : 'false'} className="admin-shell flex min-h-screen bg-background text-foreground">
      <aside data-collapsed={sidebarCollapsed ? 'true' : 'false'} className={`admin-sidebar sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 lg:flex ${sidebarCollapsed ? 'w-16' : 'w-60'}`}>
        <div className={`admin-sidebar-brand flex h-[56px] shrink-0 items-center ${sidebarCollapsed ? 'justify-center gap-1 px-2' : 'gap-2 px-3.5'}`}>
          <Link aria-label="Hi LLM 管理后台" title={sidebarCollapsed ? '管理控制台' : undefined} href="/admin" className={`admin-brand-link min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 ${sidebarCollapsed ? 'text-center' : ''}`}>
            {sidebarCollapsed
              ? (
                  <span className="relative mx-auto block size-7">
                    <Image
                      alt=""
                      fill
                      loading="eager"
                      sizes="28px"
                      src="/logo-new.png"
                      className="object-contain"
                    />
                  </span>
                )
              : (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="admin-brand-mark relative block size-7 shrink-0">
                      <Image
                        alt=""
                        fill
                        loading="eager"
                        sizes="28px"
                        src="/logo-new.png"
                        className="object-contain"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold tracking-[-0.01em]">Hi LLM</span>
                      <span className="admin-brand-kicker mt-0.5 block truncate text-[10px] font-medium">管理后台</span>
                    </span>
                  </span>
                )}
          </Link>
          <Button
            aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            size="sm"
            variant="tertiary"
            isIconOnly
            onPress={toggleSidebar}
            className="admin-sidebar-toggle size-8 shrink-0"
          >
            {sidebarCollapsed ? <ChevronsRight aria-hidden="true" className="size-4" /> : <ChevronsLeft aria-hidden="true" className="size-4" />}
          </Button>
        </div>
        {navigation(sidebarCollapsed)}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="admin-shell-header sticky top-0 z-30 flex h-[56px] items-center justify-between px-3 sm:px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Drawer state={mobileNavState}>
              <Drawer.Trigger
                aria-label="打开后台导航"
                className="inline-flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
              >
                <Bars aria-hidden="true" className="size-4" />
              </Drawer.Trigger>
              <Drawer.Backdrop>
                <Drawer.Content placement="left">
                  <Drawer.Dialog className="admin-mobile-drawer w-[min(18rem,90vw)]">
                    <Drawer.Header className="h-[56px] border-b border-border px-4">
                      <Drawer.Heading className="min-w-0 text-sm">
                        <span className="block truncate">管理控制台</span>
                        <small className="mt-0.5 block truncate text-[10px] font-medium text-muted">
                          当前 ·
                          {currentGroup.label}
                        </small>
                      </Drawer.Heading>
                      <Drawer.CloseTrigger aria-label="关闭后台导航" onPress={mobileNavState.close} />
                    </Drawer.Header>
                    <Drawer.Body className="flex min-h-0 flex-col p-0">
                      {navigation(false, true)}
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>
            <nav aria-label="面包屑" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-2 text-sm">
                {current.href === '/admin'
                  ? <li className="truncate font-semibold text-foreground">{current.label}</li>
                  : (
                      <>
                        <li className="hidden shrink-0 text-xs font-medium text-muted sm:block">{currentGroup.label}</li>
                        <li aria-hidden="true" className="hidden text-muted/60 sm:block">/</li>
                        <li aria-current="page" className="truncate font-semibold text-foreground">{current.label}</li>
                      </>
                    )}
              </ol>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AdminCommandCenter pathname={pathname} />
            <Button
              aria-label={density === 'compact' ? '切换为舒适密度' : '切换为紧凑密度'}
              size="sm"
              variant="tertiary"
              isIconOnly
              onPress={toggleDensity}
              className="admin-density-toggle"
            >
              <ListUl aria-hidden="true" className="size-4" />
            </Button>
            <Link
              aria-label="打开网站安全中心"
              href="/admin/security-center"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              <ShieldExclamation aria-hidden="true" className="size-4" />
              <span className="hidden xl:inline">安全中心</span>
            </Link>
            <Dropdown>
              <Button
                aria-label="打开新建内容菜单"
                size="sm"
                variant="primary"
                className="h-9 gap-1.5 rounded-lg px-2.5 sm:px-3"
              >
                <Plus aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">新建内容</span>
                <ChevronDown aria-hidden="true" className="hidden size-3.5 sm:block" />
              </Button>
              <Dropdown.Popover placement="bottom end" className="min-w-72">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-foreground">新建内容</p>
                  <p className="mt-0.5 text-[11px] text-muted">选择内容类型进入对应编辑器</p>
                </div>
                <Dropdown.Menu aria-label="新建内容类型" onAction={handleCreateAction}>
                  {ADMIN_CREATE_ACTIONS.map(action => (
                    <Dropdown.Item key={action.id} id={action.id} textValue={action.label}>
                      <div className="min-w-0 py-0.5">
                        <Label>{action.label}</Label>
                        <p className="mt-0.5 text-[11px] text-muted">{action.description}</p>
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <ThemeSwitcher />
            <AdminAccountMenu user={user} />
          </div>
        </header>

        <div id="admin-content" className="admin-shell-content mx-auto w-full p-4 sm:p-5 lg:p-6 xl:px-8 xl:py-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function AdminNavLink({ active, collapsed, item, preload, onNavigate }: {
  active: boolean
  collapsed: boolean
  item: AdminNavItem
  preload: (href: string) => void
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      data-active={active ? 'true' : 'false'}
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      onFocus={() => preload(item.href)}
      onMouseEnter={() => preload(item.href)}
      className={`admin-nav-link flex h-10 items-center rounded text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${collapsed ? 'justify-center px-0' : 'gap-3 px-2.5'} ${active ? 'font-semibold' : ''}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function persistPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  }
  catch {
    // Storage can be unavailable in privacy mode; the in-memory state still works.
  }
}

'use client'
import {
  Bars,
  Comments,
  House,
  Medal,
  PaperPlane,
  Xmark,
} from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import AboutDialog from '@/components/AboutDialog'
import { CATALOG_CHANNELS, getCatalogChannel } from '@/components/catalog/catalog-channels'
import SubmissionAction from '@/components/submission/submission-action'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import TranslationMenu from '@/components/TranslationMenu'
import UserAvatar from '@/components/UserAvatar'
import WebsiteSubmissionDialog from '@/components/WebsiteSubmissionDialog'
import { isProfileRoute } from '@/lib/routes/public-shell'
import { SERVICES_CONTACT_URL } from '@/lib/services-contact'

import type { CatalogChannel } from '@/components/catalog/catalog-channels'
import type { SubmissionChannel } from '@/lib/access-settings/submission-controls'
import type { CSSProperties, ElementType, FC } from 'react'

interface HeaderAction {
  catalogChannel?: CatalogChannel
  href: string
  icon?: ElementType
  label: string
  external?: boolean
  newWindow?: boolean
  submissionChannel?: SubmissionChannel
}

type HeaderTone = 'default' | 'mcp' | 'profile' | 'prompts' | 'services' | 'skills' | 'wonderland'

interface MobileNavigationProps {
  id: string
  items: NavigationItem[]
  onClose: () => void
  panelRef: React.RefObject<HTMLDivElement | null>
}

interface NavigationDefinition {
  href: string
  label: string
  icon: ElementType
}

interface NavigationItem extends NavigationDefinition {
  active: boolean
}

const NAVIGATION_ITEMS: NavigationDefinition[] = [
  { href: '/', label: '导航', icon: House },
  { href: '/ranking', label: '排行榜', icon: Medal },
  { href: CATALOG_CHANNELS.skill.rootHref, label: CATALOG_CHANNELS.skill.label, icon: CATALOG_CHANNELS.skill.icon },
  { href: CATALOG_CHANNELS.mcp.rootHref, label: CATALOG_CHANNELS.mcp.label, icon: CATALOG_CHANNELS.mcp.icon },
  { href: CATALOG_CHANNELS.prompt.rootHref, label: CATALOG_CHANNELS.prompt.label, icon: CATALOG_CHANNELS.prompt.icon },
  { href: '/wonderland', label: '妙妙屋', icon: Comments },
  // 技术支持页仍保留，但从主导航退出，收纳到「关于我们」中。
]

const Header: FC = () => {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileNavigationRef = useRef<HTMLDivElement>(null)
  const tone = getHeaderTone(pathname)
  const navItems = NAVIGATION_ITEMS.map(item => ({
    ...item,
    active: isNavigationItemActive(pathname, item.href),
  }))
  const activeIndex = navItems.findIndex(item => item.active)
  const action = getHeaderAction(pathname)
  const ActionIcon = action?.icon ?? PaperPlane
  const navigationStyle = {
    '--active-index': Math.max(activeIndex, 0),
    '--nav-count': navItems.length,
  } as CSSProperties

  useEffect(() => {
    if (!isMobileMenuOpen)
      return

    const desktopNavigation = window.matchMedia('(min-width: 768px)')
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let focusFrame = window.requestAnimationFrame(() => {
      const panel = mobileNavigationRef.current
      const focusTarget = panel?.querySelector<HTMLElement>('[aria-current="page"], a[href], button:not(:disabled)')
      focusTarget?.focus({ preventScroll: true })
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false)
        return
      }

      if (event.key !== 'Tab')
        return

      const panel = mobileNavigationRef.current
      const focusable = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
            .filter(element => element.getClientRects().length > 0)
        : []
      const first = focusable[0]
      const last = focusable.at(-1)

      if (!first || !last)
        return

      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches)
        setIsMobileMenuOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    desktopNavigation.addEventListener('change', handleViewportChange)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      desktopNavigation.removeEventListener('change', handleViewportChange)
      window.cancelAnimationFrame(focusFrame)
      focusFrame = 0
      if (!desktopNavigation.matches && previouslyFocused && document.contains(previouslyFocused))
        previouslyFocused.focus({ preventScroll: true })
    }
  }, [isMobileMenuOpen])

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <header
      data-tone={tone}
      className={`app-shell-header app-header app-header--${tone} sticky top-0 z-40 shrink-0`}
    >
      <div className="relative mx-auto grid h-16 w-full max-w-[100rem] grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        <Link
          aria-label="返回首页"
          href="/"
          onClick={closeMobileMenu}
          className="app-header-brand group flex min-w-0 items-center gap-2.5 justify-self-start"
        >
          <span className="relative size-8 shrink-0">
            <Image alt="Logo" fill loading="eager" src="/logo-new.png" className="object-contain" />
          </span>
          <span className="hidden truncate text-sm font-black tracking-[-0.04em] sm:block">
            {process.env.NEXT_PUBLIC_APP_NAME || 'HI LLM'}
          </span>
        </Link>

        <nav
          aria-label="主要导航"
          data-has-active={activeIndex >= 0}
          className="app-header-nav route-switcher relative hidden h-full min-w-0 items-center justify-self-center md:grid"
          style={navigationStyle}
        >
          <span aria-hidden="true" className="app-header-nav-indicator" />
          {navItems.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              aria-current={active ? 'page' : undefined}
              href={href}
              className="route-switcher-link app-header-nav-link group relative z-10 flex h-full min-w-0 items-center justify-center gap-1.5 px-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-[-5px] focus-visible:outline-current"
            >
              <Icon aria-hidden="true" className="app-header-nav-icon size-4 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 justify-self-end sm:gap-2">
          {pathname === '/' ? <WebsiteSubmissionDialog /> : null}
          {action
            ? action.submissionChannel
              ? (
                  <SubmissionAction
                    ariaLabel={action.label}
                    channel={action.submissionChannel}
                    href={action.href}
                    newWindow={action.newWindow}
                    className={`app-header-action group inline-flex items-center gap-1.5 px-2.5 text-xs font-black sm:px-3 ${action.catalogChannel ? 'app-header-action--catalog h-11' : 'h-9'}`}
                  >
                    <ActionIcon aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    <span className="hidden 2xl:inline">{action.label}</span>
                  </SubmissionAction>
                )
              : action.external
                ? (
                    <a
                      aria-label={action.newWindow ? `${action.label}（新窗口打开）` : action.label}
                      data-channel={action.catalogChannel}
                      href={action.href}
                      rel={action.newWindow ? 'noopener noreferrer' : undefined}
                      target={action.newWindow ? '_blank' : undefined}
                      className={`app-header-action group inline-flex items-center gap-1.5 px-2.5 text-xs font-black sm:px-3 ${action.catalogChannel ? 'app-header-action--catalog h-11' : 'h-9'}`}
                    >
                      <ActionIcon aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      <span className="hidden 2xl:inline">{action.label}</span>
                    </a>
                  )
                : (
                    <Link
                      aria-label={action.newWindow ? `${action.label}（新窗口打开）` : action.label}
                      data-channel={action.catalogChannel}
                      href={action.href}
                      rel={action.newWindow ? 'noopener noreferrer' : undefined}
                      target={action.newWindow ? '_blank' : undefined}
                      onClick={closeMobileMenu}
                      className={`app-header-action group inline-flex items-center gap-1.5 px-2.5 text-xs font-black sm:px-3 ${action.catalogChannel ? 'app-header-action--catalog h-11' : 'h-9'}`}
                    >
                      <ActionIcon aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      <span className="hidden 2xl:inline">{action.label}</span>
                    </Link>
                  )
            : null}

          <div className="app-header-tools hidden items-center gap-0.5 xl:flex [&_.button]:size-9 [&_.button]:min-w-9 [&_.button]:rounded-full [&_.button]:p-0">
            <UserAvatar />
            <AboutDialog />
            <ThemeSwitcher />
            <TranslationMenu />
          </div>
          <MobileMenuButton
            isOpen={isMobileMenuOpen}
            buttonRef={mobileMenuButtonRef}
            controls="public-mobile-navigation"
            onToggle={() => setIsMobileMenuOpen(open => !open)}
          />
        </div>
      </div>

      {isMobileMenuOpen
        ? (
            <MobileNavigation
              id="public-mobile-navigation"
              items={navItems}
              panelRef={mobileNavigationRef}
              onClose={closeMobileMenu}
            />
          )
        : null}
    </header>
  )
}

function getHeaderAction(pathname: string): HeaderAction | null {
  const catalogChannel = getCatalogChannel(pathname)
  if (catalogChannel) {
    const config = CATALOG_CHANNELS[catalogChannel]
    if (pathname.startsWith(config.submitHref))
      return null

    return {
      catalogChannel,
      href: config.submitHref,
      icon: config.icon,
      label: config.actionLabel,
      submissionChannel: catalogChannel,
    }
  }

  if (pathname.startsWith('/wonderland/works') && !pathname.startsWith('/wonderland/works/new'))
    return { href: '/wonderland/works/new', label: '发布作品', newWindow: true, submissionChannel: 'work' }

  if (pathname.startsWith('/wonderland') && !pathname.startsWith('/wonderland/ask'))
    return { href: '/wonderland/ask', label: '发布问题', newWindow: true, submissionChannel: 'wonderland' }

  if (pathname.startsWith('/services')) {
    return {
      external: true,
      href: SERVICES_CONTACT_URL,
      label: '获取支持',
      newWindow: true,
    }
  }

  return null
}

function getHeaderTone(pathname: string): HeaderTone {
  if (isProfileRoute(pathname))
    return 'profile'
  if (pathname.startsWith('/skills'))
    return 'skills'
  if (pathname.startsWith('/mcp'))
    return 'mcp'
  if (pathname.startsWith('/wonderland'))
    return 'wonderland'
  if (pathname.startsWith('/prompts'))
    return 'prompts'
  if (pathname.startsWith('/services'))
    return 'services'

  return 'default'
}

function isNavigationItemActive(pathname: string, href: string) {
  if (href === '/')
    return pathname === href

  return pathname === href || pathname.startsWith(`${href}/`)
}

function MobileMenuButton({ buttonRef, controls, isOpen, onToggle }: { buttonRef: React.RefObject<HTMLButtonElement | null>, controls: string, isOpen: boolean, onToggle: () => void }) {
  const Icon = isOpen ? Xmark : Bars

  return (
    <button
      ref={buttonRef}
      aria-controls={controls}
      aria-expanded={isOpen}
      aria-label={isOpen ? '关闭菜单' : '打开菜单'}
      type="button"
      data-open={isOpen}
      onClick={onToggle}
      className="mobile-menu-button grid size-10 shrink-0 place-items-center rounded-xl text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current md:hidden"
    >
      <Icon aria-hidden="true" className="size-[1.1rem]" />
    </button>
  )
}

function MobileNavigation({ id, items, onClose, panelRef }: MobileNavigationProps) {
  return (
    <div className="mobile-navigation-layer fixed inset-x-0 bottom-0 top-16 z-50 md:hidden">
      <button
        aria-label="关闭菜单"
        type="button"
        onClick={onClose}
        className="mobile-navigation-backdrop absolute inset-0"
      />
      <div
        ref={panelRef}
        aria-label="移动端导航菜单"
        aria-modal="true"
        id={id}
        role="dialog"
        className="mobile-navigation-panel absolute inset-x-0 top-0 overflow-hidden rounded-b-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6"
      >
        <div className="mobile-navigation-heading flex items-end justify-between px-1 pb-3">
          <div>
            <p className="text-sm font-black tracking-[-0.025em]">快速前往</p>
            <p className="mt-0.5 text-[10px] font-medium">探索 HiLLM 的内容与社区</p>
          </div>
          <span aria-hidden="true" className="mobile-navigation-status text-[9px] font-bold">
            {items.length}
            {' '}
            个入口
          </span>
        </div>

        <nav aria-label="移动端主要导航" className="grid grid-cols-2 gap-2">
          {items.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              aria-current={active ? 'page' : undefined}
              href={href}
              onClick={onClose}
              className="mobile-navigation-link group relative flex min-h-13 min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current"
            >
              <span className="mobile-navigation-icon-shell grid size-8 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden="true" className="mobile-navigation-icon size-4" />
              </span>
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mobile-navigation-settings mt-3 flex items-center justify-between px-1 pt-3">
          <span className="text-[10px] font-bold">账户与页面设置</span>
          <div className="flex items-center gap-1 [&_.button]:size-9 [&_.button]:min-w-9 [&_.button]:rounded-full [&_.button]:p-0">
            <UserAvatar />
            <AboutDialog />
            <ThemeSwitcher />
            <TranslationMenu />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Header

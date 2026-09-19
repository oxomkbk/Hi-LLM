'use client'

import {
  ArrowRight,
  Clock,
  Magnifier,
  Plus,
} from '@gravity-ui/icons'
import { Modal, SearchField } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ADMIN_CREATE_ACTIONS,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  findAdminNavGroup,
} from './admin-navigation'

import type { ReactNode } from 'react'

const RECENT_STORAGE_KEY = 'hillm-nav:admin-recent-pages:v1'
const MAX_RECENT_ITEMS = 5

const NAVIGATION_DESCRIPTIONS: Record<string, string> = {
  '/admin': '查看今日访问、待办、内容发布和系统状态',
  '/admin/access': '控制前台访问、翻译、注册和发布规则',
  '/admin/categories': '维护导航分类、顺序和显示状态',
  '/admin/content': '跨 Skills、MCP 与 Prompts 查询全部内容',
  '/admin/email': '配置邮件服务并验证发送能力',
  '/admin/infrastructure': '检查数据库、对象存储和运行环境',
  '/admin/llm': '配置站内 AI 能力、模型和调用参数',
  '/admin/mcp/content': '管理已收录 MCP 服务和发布状态',
  '/admin/mcp/submissions': '审核社区提交的 MCP 服务',
  '/admin/media': '查找、复用和清理对象存储素材',
  '/admin/prompts': '管理提示词、样式与多媒体方案',
  '/admin/prompts/categories': '维护 Prompts 分类体系',
  '/admin/security': '处理安全评测、风险和发布阻断',
  '/admin/security-center': '开关网站安全防护并查看最新风险状态',
  '/admin/skills/content': '管理已收录 Skills 与安全状态',
  '/admin/skills/submissions': '审核社区提交的 Skills',
  '/admin/submissions': '审核导航网站投稿',
  '/admin/users': '查看用户状态、权限和社区贡献',
  '/admin/websites': '维护导航网站资料、分类和排序',
  '/admin/wonderland/categories': '维护妙妙屋内容分类',
  '/admin/wonderland/comments': '检索与管理社区评论',
  '/admin/wonderland/news': '管理社区文章和运营内容',
  '/admin/wonderland/questions': '管理问题、回答和可见性',
  '/admin/wonderland/reports': '处理用户举报和违规内容',
  '/admin/wonderland/works': '审核与管理社区作品',
}

interface AdminCommandCenterProps {
  pathname: string
}

export default function AdminCommandCenter({ pathname }: AdminCommandCenterProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const recentHrefsRef = useRef<string[]>([])

  useEffect(() => {
    const stored = readRecentPages()
    const next = [pathname, ...stored.filter(href => href !== pathname)].slice(0, MAX_RECENT_ITEMS)
    recentHrefsRef.current = next
    try {
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
    }
    catch {
      // Navigation remains usable when private browsing or quota blocks storage.
    }
  }, [pathname])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsOpen(current => !current)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!isOpen)
      return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const matches = useMemo(() => ADMIN_NAV_ITEMS.filter((item) => {
    if (!normalizedQuery)
      return true
    const group = findAdminNavGroup(item.group)
    return [item.label, group.label, NAVIGATION_DESCRIPTIONS[item.href] ?? '', item.href]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery)
  }), [normalizedQuery])
  const matchingCreates = useMemo(() => ADMIN_CREATE_ACTIONS.filter(action => !normalizedQuery
    || `${action.label} ${action.description}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)), [normalizedQuery])
  const recentItems = recentHrefsRef.current
    .map(href => ADMIN_NAV_ITEMS.find(item => item.href === href))
    .filter(item => item !== undefined)

  const navigate = (href: string) => {
    setIsOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <>
      <button aria-label="搜索后台页面或操作" type="button" onClick={() => setIsOpen(true)} className="admin-command-trigger">
        <Magnifier aria-hidden="true" />
        <span>搜索后台</span>
        <kbd>⌘ K</kbd>
      </button>

      <Modal.Backdrop variant="blur" isOpen={isOpen} onOpenChange={setIsOpen} className="admin-command-backdrop">
        <Modal.Container placement="top" className="pt-[8vh] sm:pt-[12vh]">
          <Modal.Dialog aria-label="后台命令中心" className="admin-command-dialog sm:max-w-[720px]">
            <Modal.Header className="admin-command-search">
              <SearchField aria-label="搜索后台页面或操作" value={query} onChange={setQuery}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input ref={inputRef} placeholder="输入页面、功能或操作，例如“审核作品”…" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Modal.CloseTrigger aria-label="关闭命令中心" onPress={() => setIsOpen(false)} />
            </Modal.Header>

            <Modal.Body className="admin-command-body">
              {!normalizedQuery && recentItems.length
                ? (
                    <CommandSection icon={<Clock />} label="最近访问">
                      {recentItems.map(item => (
                        <CommandItem
                          key={`recent-${item.href}`}
                          description={NAVIGATION_DESCRIPTIONS[item.href]}
                          icon={<item.icon />}
                          label={item.label}
                          meta={findAdminNavGroup(item.group).label}
                          onSelect={() => navigate(item.href)}
                        />
                      ))}
                    </CommandSection>
                  )
                : null}

              {matchingCreates.length
                ? (
                    <CommandSection icon={<Plus />} label="快捷新建">
                      {matchingCreates.map(action => (
                        <CommandItem
                          key={action.id}
                          description={action.description}
                          icon={<Plus />}
                          label={action.label}
                          meta="新建"
                          onSelect={() => navigate(action.href)}
                        />
                      ))}
                    </CommandSection>
                  )
                : null}

              {ADMIN_NAV_GROUPS.map((group) => {
                const items = matches.filter(item => item.group === group.id)
                if (!items.length)
                  return null
                return (
                  <CommandSection key={group.id} label={group.label}>
                    {items.map(item => (
                      <CommandItem
                        key={item.href}
                        active={item.match(pathname)}
                        description={NAVIGATION_DESCRIPTIONS[item.href]}
                        icon={<item.icon />}
                        label={item.label}
                        meta={item.match(pathname) ? '当前页面' : undefined}
                        onSelect={() => navigate(item.href)}
                      />
                    ))}
                  </CommandSection>
                )
              })}

              {!matches.length && !matchingCreates.length
                ? (
                    <div className="admin-command-empty">
                      <Magnifier />
                      <strong>没有找到对应功能</strong>
                      <span>可以尝试“用户”“投稿”“素材”或“设置”</span>
                    </div>
                  )
                : null}
            </Modal.Body>

            <Modal.Footer className="admin-command-footer">
              <span>
                <kbd>Tab</kbd>
                {' '}
                浏览
              </span>
              <span>
                <kbd>Enter</kbd>
                {' '}
                打开
              </span>
              <span>
                <kbd>Esc</kbd>
                {' '}
                关闭
              </span>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

function CommandItem({ active = false, description, icon, label, meta, onSelect }: {
  active?: boolean
  description?: string
  icon: ReactNode
  label: string
  meta?: string
  onSelect: VoidFunction
}) {
  return (
    <button type="button" data-active={active ? 'true' : undefined} onClick={onSelect} className="admin-command-item">
      <span className="admin-command-item-icon">{icon}</span>
      <span className="admin-command-item-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {meta ? <em>{meta}</em> : null}
      <ArrowRight aria-hidden="true" />
    </button>
  )
}

function CommandSection({ children, icon, label }: { children: ReactNode, icon?: ReactNode, label: string }) {
  return (
    <section className="admin-command-section">
      <h2>
        {icon}
        {label}
      </h2>
      <div>{children}</div>
    </section>
  )
}

function readRecentPages() {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
  }
  catch {
    return []
  }
}

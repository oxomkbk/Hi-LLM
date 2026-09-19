import {
  Code,
  Comment,
  Comments,
  Cpu,
  Cubes3,
  Envelope,
  Flag,
  Folder,
  FolderTree,
  Gear,
  Globe,
  House,
  Layers,
  ListCheck,
  MagicWand,
  Persons,
  Picture,
  PlugConnection,
  Server,
  Shield,
  ShieldCheck,
  ShieldExclamation,
  SquareArticle,
} from '@gravity-ui/icons'

import type { ComponentType } from 'react'

export interface AdminNavGroup {
  id: AdminNavGroupId
  label: string
}

export type AdminNavGroupId = 'WORKSPACE' | 'CONTENT' | 'TRUST' | 'OPERATIONS' | 'SYSTEM'

export interface AdminNavItem {
  group: AdminNavGroupId
  href: string
  icon: ComponentType<{ className?: string }>
  label: string
  match: (pathname: string) => boolean
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { id: 'WORKSPACE', label: '工作台' },
  { id: 'CONTENT', label: '内容与目录' },
  { id: 'TRUST', label: '审核与安全' },
  { id: 'OPERATIONS', label: '妙妙屋运营' },
  { id: 'SYSTEM', label: '系统管理' },
]

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    group: 'WORKSPACE',
    href: '/admin',
    icon: House,
    label: '概览',
    match: pathname => pathname === '/admin',
  },
  {
    group: 'CONTENT',
    href: '/admin/content',
    icon: Layers,
    label: '目录内容',
    match: pathname => pathname === '/admin/content',
  },
  {
    group: 'CONTENT',
    href: '/admin/categories',
    icon: Folder,
    label: '网站分类',
    match: pathname => pathname === '/admin/categories',
  },
  {
    group: 'CONTENT',
    href: '/admin/websites',
    icon: Globe,
    label: '导航网站',
    match: pathname => pathname === '/admin/websites',
  },
  {
    group: 'CONTENT',
    href: '/admin/media',
    icon: Picture,
    label: '素材库',
    match: pathname => pathname === '/admin/media',
  },
  {
    group: 'CONTENT',
    href: '/admin/skills/content',
    icon: Code,
    label: 'Skills',
    match: pathname => pathname === '/admin/skills/content'
      || pathname === '/admin/skills/new'
      || /^\/admin\/skills\/[^/]+\/edit$/.test(pathname),
  },
  {
    group: 'CONTENT',
    href: '/admin/mcp/content',
    icon: Server,
    label: 'MCP',
    match: pathname => pathname === '/admin/mcp/content'
      || pathname === '/admin/mcp/new'
      || /^\/admin\/mcp\/[^/]+\/edit$/.test(pathname),
  },
  {
    group: 'CONTENT',
    href: '/admin/prompts',
    icon: MagicWand,
    label: 'Prompts',
    match: pathname => pathname === '/admin/prompts',
  },
  {
    group: 'CONTENT',
    href: '/admin/prompts/categories',
    icon: FolderTree,
    label: 'Prompts 分类',
    match: pathname => pathname === '/admin/prompts/categories',
  },
  {
    group: 'TRUST',
    href: '/admin/submissions',
    icon: ListCheck,
    label: '网站投稿',
    match: pathname => pathname === '/admin/submissions',
  },
  {
    group: 'TRUST',
    href: '/admin/skills/submissions',
    icon: MagicWand,
    label: 'Skills 投稿',
    match: pathname => pathname === '/admin/skills/submissions' || pathname.startsWith('/admin/skills/submissions/'),
  },
  {
    group: 'TRUST',
    href: '/admin/mcp/submissions',
    icon: PlugConnection,
    label: 'MCP 投稿',
    match: pathname => pathname === '/admin/mcp/submissions' || pathname.startsWith('/admin/mcp/submissions/'),
  },
  {
    group: 'TRUST',
    href: '/admin/security-center',
    icon: Shield,
    label: '安全中心',
    match: pathname => pathname === '/admin/security-center',
  },
  {
    group: 'TRUST',
    href: '/admin/security',
    icon: ShieldExclamation,
    label: '内容安全评测',
    match: pathname => pathname === '/admin/security' || pathname.startsWith('/admin/security/'),
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/categories',
    icon: FolderTree,
    label: '社区分类',
    match: pathname => pathname === '/admin/wonderland/categories',
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/news',
    icon: SquareArticle,
    label: '文章',
    match: pathname => pathname === '/admin/wonderland/news' || pathname.startsWith('/admin/wonderland/news/'),
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/questions',
    icon: Comments,
    label: '问答',
    match: pathname => pathname === '/admin/wonderland/questions',
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/works',
    icon: Cubes3,
    label: '作品',
    match: pathname => pathname === '/admin/wonderland/works' || pathname.startsWith('/admin/wonderland/works/'),
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/comments',
    icon: Comment,
    label: '评论',
    match: pathname => pathname === '/admin/wonderland/comments',
  },
  {
    group: 'OPERATIONS',
    href: '/admin/wonderland/reports',
    icon: Flag,
    label: '举报处理',
    match: pathname => pathname === '/admin/wonderland/reports',
  },
  {
    group: 'SYSTEM',
    href: '/admin/access',
    icon: ShieldCheck,
    label: '访问与发布',
    match: pathname => pathname === '/admin/access',
  },
  {
    group: 'SYSTEM',
    href: '/admin/users',
    icon: Persons,
    label: '用户管理',
    match: pathname => pathname === '/admin/users',
  },
  {
    group: 'SYSTEM',
    href: '/admin/email',
    icon: Envelope,
    label: '邮件服务',
    match: pathname => pathname === '/admin/email',
  },
  {
    group: 'SYSTEM',
    href: '/admin/llm',
    icon: Cpu,
    label: '大模型设置',
    match: pathname => pathname === '/admin/llm',
  },
  {
    group: 'SYSTEM',
    href: '/admin/infrastructure',
    icon: Gear,
    label: '基础设施',
    match: pathname => pathname === '/admin/infrastructure',
  },
]

export const ADMIN_CREATE_ACTIONS = [
  { id: 'website', href: '/admin/websites?create=1', label: '新增网站', description: '收录导航网站并设置所属分类' },
  { id: 'skill', href: '/admin/skills/new', label: '新建 Skill', description: '创建可发布的 Agent 能力' },
  { id: 'mcp', href: '/admin/mcp/new', label: '新建 MCP', description: '登记 MCP 服务与安装配置' },
  { id: 'prompt', href: '/admin/prompts?create=1', label: '新建 Prompt', description: '创建提示词、样式或多媒体方案' },
  { id: 'news', href: '/admin/wonderland/news/new', label: '新建文章', description: '发布妙妙屋运营内容' },
  { id: 'work', href: '/admin/wonderland/works/new', label: '新建作品', description: '创建社区作品并完善展示资料' },
] as const

export function findAdminNavGroup(groupId: AdminNavGroupId) {
  return ADMIN_NAV_GROUPS.find(group => group.id === groupId) ?? ADMIN_NAV_GROUPS[0]
}

export function findAdminNavItem(pathname: string) {
  return ADMIN_NAV_ITEMS.find(item => item.match(pathname)) ?? ADMIN_NAV_ITEMS[0]
}

export function nextAdminOpenGroups(current: ReadonlySet<AdminNavGroupId>, target: AdminNavGroupId) {
  const next = new Set(current)
  next.add('WORKSPACE')

  if (target !== 'WORKSPACE') {
    if (next.has(target))
      next.delete(target)
    else
      next.add(target)
  }

  return next
}

export function parseAdminOpenGroups(value: string | null, currentGroup: AdminNavGroupId) {
  const valid = new Set(ADMIN_NAV_GROUPS.map(group => group.id))
  let stored: unknown = ['CONTENT']
  try {
    stored = value ? JSON.parse(value) : ['CONTENT']
  }
  catch {
    stored = ['CONTENT']
  }

  const groups = Array.isArray(stored)
    ? stored.filter((group): group is AdminNavGroupId => typeof group === 'string' && valid.has(group as AdminNavGroupId))
    : []

  return new Set<AdminNavGroupId>(['WORKSPACE', ...groups, currentGroup])
}

export function resolveAdminOpenGroupsPreference(value: string | null, currentGroup: AdminNavGroupId) {
  const groups = parseAdminOpenGroups(value, currentGroup)
  return {
    groups,
    serialized: JSON.stringify([...groups]),
  }
}

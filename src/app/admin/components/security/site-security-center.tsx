'use client'

import {
  ArrowRight,
  ArrowRotateLeft,
  CircleCheckFill,
  Eye,
  Lock,
  Magnifier,
  Person,
  ShieldCheck,
  ShieldExclamation,
} from '@gravity-ui/icons'
import { Button, Chip, Switch, toast } from '@heroui/react'
import Link from 'next/link'
import { useState } from 'react'

import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import type { SiteProtectionKey, SiteSecurityCenterState } from '@/lib/site-security-center/types'
import type { ComponentType } from 'react'

const PROTECTION_COPY: Array<{
  description: string
  disabledLabel: string
  enabledLabel: string
  icon: ComponentType<{ className?: string }>
  key: SiteProtectionKey
  title: string
}> = [
  {
    description: '拦截 AI 检索的重复提交和异常高频请求，减少误触与接口滥用。',
    disabledLabel: '不限制',
    enabledLabel: '防重复与限流',
    icon: Magnifier,
    key: 'aiSearchAbuseProtection',
    title: 'AI 检索防刷',
  },
  {
    description: '新提交的 Skills、MCP 与 Prompts 自动进入安全评测队列。',
    disabledLabel: '已暂停',
    enabledLabel: '自动检测',
    icon: ShieldCheck,
    key: 'automaticScanning',
    title: '自动安全检测',
  },
  {
    description: '发现危险命令、恶意执行或数据破坏行为时暂停发布。关闭后只提醒管理员。',
    disabledLabel: '仅提醒',
    enabledLabel: '自动拦截',
    icon: Lock,
    key: 'dangerousContentBlocking',
    title: '危险内容拦截',
  },
  {
    description: '网站、Skills、MCP 和妙妙屋内容必须登录后才能正式发布。',
    disabledLabel: '允许访客提交',
    enabledLabel: '需要登录',
    icon: Person,
    key: 'publisherVerification',
    title: '发布者身份验证',
  },
  {
    description: '在内容详情页向访问者显示安全分数、等级、风险数量和检测摘要。',
    disabledLabel: '前台隐藏',
    enabledLabel: '前台显示',
    icon: Eye,
    key: 'publicSecurityStatus',
    title: '展示安全结果',
  },
]

export default function SiteSecurityCenter({ initialData }: { initialData: SiteSecurityCenterState }) {
  const [data, setData] = useState(initialData)
  const [pendingKey, setPendingKey] = useState<SiteProtectionKey | 'refresh' | null>(null)
  const enabledCount = Object.values(data.protections).filter(Boolean).length
  const primaryProtectionReady = data.protections.automaticScanning && data.protections.dangerousContentBlocking
  const status = primaryProtectionReady ? 'protected' : data.protections.automaticScanning ? 'attention' : 'paused'

  const updateProtection = async (key: SiteProtectionKey, enabled: boolean) => {
    if (pendingKey || !data.canManage)
      return
    const previous = data
    setPendingKey(key)
    setData(current => ({
      ...current,
      protections: { ...current.protections, [key]: enabled },
    }))
    try {
      const result = await request<SiteSecurityCenterState>('/admin/site-security-center', {
        body: JSON.stringify({ enabled, key }),
        method: 'PATCH',
      })
      setData(result.data)
      toast.success(enabled ? '防护已开启' : key === 'dangerousContentBlocking' ? '已改为仅提醒' : '防护已关闭')
    }
    catch {
      setData(previous)
    }
    finally {
      setPendingKey(null)
    }
  }

  const refresh = async () => {
    if (pendingKey)
      return
    setPendingKey('refresh')
    try {
      const result = await request<SiteSecurityCenterState>('/admin/site-security-center')
      setData(result.data)
    }
    finally {
      setPendingKey(null)
    }
  }

  return (
    <main className="site-security-center">
      <header data-status={status} className="site-security-heading">
        <div className="site-security-heading__copy">
          <p>网站安全与内容风控</p>
          <h1>安全中心</h1>
          <span>用简单开关管理内容检测、AI 检索防刷和发布身份验证。</span>
        </div>
        <div className="site-security-heading__state">
          <span className="site-security-state-mark">
            {status === 'protected' ? <CircleCheckFill /> : <ShieldExclamation />}
          </span>
          <div>
            <strong>{status === 'protected' ? '核心防护已开启' : status === 'attention' ? '建议开启危险内容拦截' : '自动安全检测已暂停'}</strong>
            <small>
              {enabledCount}
              {' '}
              /
              {' '}
              {PROTECTION_COPY.length}
              {' '}
              项防护已开启
            </small>
          </div>
          <Button
            aria-label="刷新安全状态"
            size="sm"
            variant="secondary"
            isIconOnly
            isPending={pendingKey === 'refresh'}
            onPress={() => void refresh()}
          >
            <ArrowRotateLeft />
          </Button>
        </div>
      </header>

      <section aria-label="安全数据概览" className="site-security-metrics">
        <SecurityMetric detail={`队列 ${data.runtime.queueSize}`} label="正在检测" value={data.metrics.active} />
        <SecurityMetric detail="历史危险记录" label="已自动阻断" tone="danger" value={data.metrics.blocked} />
        <SecurityMetric detail="建议人工确认" label="需要复核" tone="warning" value={data.metrics.reviewRequired} />
        <SecurityMetric detail={`${data.metrics.failed} 条当前依据待补充`} label="检测通过" tone="success" value={data.metrics.passed} />
      </section>

      <div className="site-security-layout">
        <section aria-labelledby="site-protection-title" className="site-security-protections">
          <header>
            <div>
              <h2 id="site-protection-title">防护开关</h2>
              <p>修改后立即生效，系统自动记录管理员操作。</p>
            </div>
            <Chip color={data.canManage ? 'success' : 'default'} size="sm" variant="soft">
              {data.canManage ? '可以修改' : '只读'}
            </Chip>
          </header>
          <div className="site-security-protection-list">
            {PROTECTION_COPY.map((item) => {
              const Icon = item.icon
              const selected = data.protections[item.key]
              return (
                <article key={item.key} className="site-security-protection-row">
                  <span className="site-security-protection-icon"><Icon /></span>
                  <div className="site-security-protection-copy">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <Switch
                    aria-label={`${selected ? '关闭' : '开启'}${item.title}`}
                    size="sm"
                    isDisabled={!data.canManage || Boolean(pendingKey)}
                    isSelected={selected}
                    onChange={enabled => void updateProtection(item.key, enabled)}
                  >
                    <Switch.Content>
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                      <span>{pendingKey === item.key ? '保存中' : selected ? item.enabledLabel : item.disabledLabel}</span>
                    </Switch.Content>
                  </Switch>
                </article>
              )
            })}
          </div>
        </section>

        <aside aria-labelledby="site-security-events-title" className="site-security-events">
          <header>
            <div>
              <h2 id="site-security-events-title">最近风险</h2>
              <p>{runtimeLabel(data.runtime)}</p>
            </div>
            <Link href="/admin/security" className="site-security-detail-link">
              高级评测
              <ArrowRight />
            </Link>
          </header>
          {data.recentIssues.length
            ? (
                <div className="site-security-event-list">
                  {data.recentIssues.map(issue => (
                    <Link key={issue.id} href={issue.href} className="site-security-event-row">
                      <span data-tone={issue.status} className="site-security-event-dot" />
                      <span>
                        <strong>{issue.name}</strong>
                        <small>
                          {subjectLabel(issue.subjectType)}
                          {' · '}
                          {issueStatusLabel(issue.status)}
                        </small>
                      </span>
                      <time dateTime={issue.createdAt}>{formatDate(issue.createdAt, 'datetime')}</time>
                    </Link>
                  ))}
                </div>
              )
            : (
                <div className="site-security-empty">
                  <ShieldCheck />
                  <strong>暂时没有需要处理的风险</strong>
                  <span>新的风险或建议核对项会显示在这里。</span>
                </div>
              )}
          <footer>
            <span>
              数据更新于
              {' '}
              <time dateTime={data.generatedAt}>{formatDate(data.generatedAt, 'datetime')}</time>
            </span>
          </footer>
        </aside>
      </div>
    </main>
  )
}

function issueStatusLabel(status: SiteSecurityCenterState['recentIssues'][number]['status']) {
  return { blocked: '已阻断', failed: '当前依据待补充', review_required: '建议核对' }[status]
}

function runtimeLabel(runtime: SiteSecurityCenterState['runtime']) {
  if (runtime.status === 'healthy')
    return `${runtime.workerCount} 个执行节点在线`
  if (runtime.status === 'paused')
    return '自动检测已暂停'
  if (runtime.status === 'offline')
    return '执行节点当前离线'
  return '安全服务状态需要关注'
}

function SecurityMetric({ detail, label, tone = 'default', value }: {
  detail: string
  label: string
  tone?: 'danger' | 'default' | 'success' | 'warning'
  value: number
}) {
  return (
    <div data-tone={tone} className="site-security-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function subjectLabel(type: string) {
  return ({ mcp: 'MCP', mcp_submission: 'MCP 投稿', prompt: 'Prompt', skill: 'Skill', skill_submission: 'Skill 投稿' } as Record<string, string>)[type] ?? type
}

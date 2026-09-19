import {
  ArrowRight,
  CircleCheckFill,
  Code,
  Eye,
  FileCode,
  Globe,
  MagicWand,
  Persons,
  PlugConnection,
  Plus,
  TriangleExclamationFill,
} from '@gravity-ui/icons'
import Link from 'next/link'

import { catalogIconSource } from '@/lib/catalog-icons'

import AdminAnalyticsScreen from './admin-analytics-screen'
import { formatAdminNumber, summarizeDashboardContent } from './admin-dashboard-view-model'

import type {
  AdminDashboardContentChannel,
  AdminDashboardData,
  AdminDashboardReviewQueue,
} from './dashboard-data'
import type { ComponentType, SVGProps } from 'react'

type DashboardIcon = ComponentType<SVGProps<SVGSVGElement>>

const CHANNEL_ICONS: Record<AdminDashboardContentChannel['id'], DashboardIcon> = {
  mcp: PlugConnection,
  prompts: FileCode,
  skills: Code,
  websites: Globe,
}

export default function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const contentSummary = summarizeDashboardContent(data.content)
  const pendingReviews = data.reviews.reduce((total, queue) => total + queue.count, 0)
  const risks = data.security.blocked + data.security.failed + data.security.reviewRequired
  const priorityCount = pendingReviews + risks
  const priorityAvailable = data.reviews.every(queue => queue.available) && data.security.summaryAvailable
  const allContentAvailable = data.content.every(channel => channel.available)
  const directoryContentAvailable = data.content.filter(channel => channel.id !== 'websites').every(channel => channel.available)
  const hasAnyDashboardData = data.audience.trafficSummaryAvailable
    || data.audience.userSummaryAvailable
    || data.content.some(channel => channel.available)
    || data.reviews.some(queue => queue.available)
    || data.security.summaryAvailable
    || data.security.available
  const status = dashboardStatus(data.failedModules.length, hasAnyDashboardData)
  const priorityHref = risks > 0
    ? '/admin/security'
    : data.reviews.find(queue => queue.available && queue.count > 0)?.href ?? '/admin/content'
  const showPriorityAction = priorityAvailable || data.reviews.some(queue => queue.available) || data.security.summaryAvailable

  return (
    <div className="admin-dashboard mx-auto w-full max-w-[1480px] pb-6">
      <header className="admin-dashboard-heading">
        <div className="admin-dashboard-title-block">
          <div className="admin-dashboard-title-line">
            <h1>后台概览</h1>
            <time dateTime={data.generatedAt}>{formatCalendarDate(data.generatedAt)}</time>
          </div>
          <p className="admin-dashboard-lede">内容发布、访问增长、审核队列与系统安全状态。</p>
          <div className="admin-dashboard-title-meta">
            <span className={status.tone}>
              {status.tone === 'is-ready' ? <CircleCheckFill /> : <TriangleExclamationFill />}
              {status.label}
            </span>
            <time dateTime={data.generatedAt}>
              更新于
              {' '}
              {formatUpdateTime(data.generatedAt)}
            </time>
          </div>
        </div>
        <div aria-label="待处理事项" className="admin-dashboard-priority">
          <div className="admin-dashboard-priority-label">
            <span className="admin-dashboard-priority-mark" />
            <span>待处理事项</span>
          </div>
          <div className="admin-dashboard-priority-body">
            <strong>{priorityAvailable ? formatAdminNumber(priorityCount) : '—'}</strong>
            <div>
              <b>{priorityAvailable ? (priorityCount ? '待处理审核与风险' : '暂无待处理事项') : '数量暂不可用'}</b>
              <small>{priorityAvailable ? `${formatAdminNumber(pendingReviews)} 条审核 · ${formatAdminNumber(risks)} 项风险` : '部分审核或风险数据不可用'}</small>
            </div>
          </div>
          {showPriorityAction
            ? (
                <Link href={priorityAvailable && priorityCount ? priorityHref : '/admin/security'}>
                  {priorityAvailable && priorityCount ? '处理待办' : '进入审核中心'}
                  <ArrowRight />
                </Link>
              )
            : null}
        </div>
      </header>

      {data.failedModules.length
        ? (
            <div role="status" className="admin-dashboard-notice">
              <TriangleExclamationFill aria-hidden="true" />
              <p>
                <strong>暂不可用：</strong>
                {data.failedModules.join('、')}
                。其余模块继续使用实时数据。
              </p>
            </div>
          )
        : null}

      <section aria-label="核心经营指标" className="admin-kpi-grid">
        <Metric available={data.audience.trafficSummaryAvailable} detail={`近 7 天 ${formatAdminNumber(data.audience.visits7d)} 次`} icon={Eye} label="今日有效访问" value={data.audience.visitsToday} />
        <Metric
          available={data.audience.userSummaryAvailable}
          detail={`近 30 天新增 ${formatAdminNumber(data.audience.newUsers30d)}`}
          href="/admin/users"
          icon={Persons}
          label="注册用户"
          value={data.audience.totalUsers}
        />
        <Metric
          available={directoryContentAvailable}
          detail={`${formatAdminNumber(contentSummary.directory.draft)} 条等待发布`}
          href="/admin/content"
          icon={FileCode}
          label="已发布目录内容"
          value={contentSummary.directory.published}
        />
        <Metric
          available={data.audience.trafficSummaryAvailable}
          detail={`${formatAdminNumber(data.audience.visits7d)} 次有效访问`}
          href="/admin/websites"
          icon={Globe}
          label="近 7 天活跃站点"
          value={data.audience.activeSites7d}
        />
      </section>

      <nav aria-label="常用管理操作" className="admin-dashboard-shortcuts">
        <span>常用操作</span>
        <Link href="/admin/websites?create=1">
          <Plus />
          新增网站
        </Link>
        <Link href="/admin/skills/new">
          <Plus />
          新建 Skill
        </Link>
        <Link href="/admin/prompts?create=1">
          <MagicWand />
          新建 Prompt
        </Link>
        <Link href="/admin/wonderland/news/new">
          <FileCode />
          发布文章
        </Link>
        <Link href="/admin/users">
          <Persons />
          查找用户
        </Link>
      </nav>

      <div className="admin-dashboard-primary-grid">
        <AdminAnalyticsScreen audience={data.audience} />
        <section className="admin-dashboard-panel admin-dashboard-queue">
          <SectionHeading
            title="内容审核"
            description={data.reviews.every(queue => queue.available) ? `${formatAdminNumber(pendingReviews)} 条投稿待审核` : '部分队列数据不可用'}
          />
          <ul className="admin-dashboard-queue-list">
            {data.reviews.map(queue => <ReviewQueueRow key={queue.id} queue={queue} />)}
          </ul>
          <div className="admin-dashboard-runtime">
            <span className={`admin-runtime-dot ${runtimeTone(data)}`} />
            <div>
              <strong>{runtimeLabel(data)}</strong>
              <small>{data.security.available ? `${formatAdminNumber(data.security.workerCount)} 个在线节点 · ${formatAdminNumber(data.security.active)} 个任务执行中` : '执行节点数据暂不可用'}</small>
            </div>
            <span>{data.security.available ? `${formatAdminNumber(data.security.queued)} 排队` : '—'}</span>
          </div>
        </section>
      </div>

      <div className="admin-dashboard-secondary-grid">
        <section className="admin-dashboard-panel">
          <SectionHeading
            title="目录与站点发布" action={(
              <Link href="/admin/content">
                目录内容
                <ArrowRight />
              </Link>
            )} description={allContentAvailable ? `${formatAdminNumber(contentSummary.all.total)} 条记录` : '部分渠道数据不可用'}
          />
          <div aria-hidden="true" className="admin-content-ledger-head">
            <span>渠道</span>
            <span>总量</span>
            <span>已发布</span>
            <span>待发布</span>
          </div>
          <ul className="admin-content-ledger">
            {data.content.map(channel => <ContentChannelRow key={channel.id} channel={channel} />)}
          </ul>
        </section>

        <section className="admin-dashboard-panel">
          <SectionHeading
            title="热门站点" action={(
              <Link href="/admin/websites">
                管理网站
                <ArrowRight />
              </Link>
            )} description={data.audience.topSitesAvailable ? `近 7 天 · ${formatAdminNumber(data.audience.activeSites7d)} 个活跃站点` : '访问排行数据暂不可用'}
          />
          <div className="admin-top-sites">
            {!data.audience.topSitesAvailable
              ? <EmptyPanel title="排行暂不可用" description="访问数据恢复后会自动显示" />
              : data.audience.topSites.length
                ? data.audience.topSites.map((site, index) => (
                    <div key={`${site.name}:${site.logo ?? 'no-logo'}`} className="admin-top-site-row">
                      <span className="admin-top-site-rank">{String(index + 1).padStart(2, '0')}</span>
                      <TopSiteMark name={site.name} logo={site.logo} />
                      <strong>{site.name}</strong>
                      <span>
                        {formatAdminNumber(site.visits)}
                        {' '}
                        次
                      </span>
                    </div>
                  ))
                : <EmptyPanel title="暂无访问排行" description="产生有效导航访问后将在这里显示" />}
          </div>
        </section>

        <section className="admin-dashboard-panel">
          <SectionHeading
            title="风险与异常" action={(
              <Link href="/admin/security">
                全部记录
                <ArrowRight />
              </Link>
            )} description="需处理、建议核对或当前依据待补充"
          />
          <div className="admin-dashboard-issues">
            {!data.security.summaryAvailable
              ? <EmptyPanel title="风险数据暂不可用" description="其他工作区仍可继续使用" />
              : data.security.issues.length
                ? data.security.issues.map(issue => (
                    <Link key={issue.id} href={`/admin/security/${issue.id}`} className="admin-dashboard-issue">
                      <span className={issue.tone === 'danger' ? 'is-danger' : 'is-warning'} />
                      <span>
                        <strong>{issue.name || '未命名内容'}</strong>
                        <small>
                          {issue.typeLabel}
                          {' '}
                          ·
                          {' '}
                          {formatDate(issue.createdAt)}
                        </small>
                      </span>
                      <ArrowRight />
                    </Link>
                  ))
                : <EmptyPanel title="暂无待处理风险" description="最近评测未发现异常" success />}
          </div>
        </section>
      </div>
    </div>
  )
}

function ContentChannelRow({ channel }: { channel: AdminDashboardContentChannel }) {
  const Icon = CHANNEL_ICONS[channel.id]
  return (
    <li>
      <Link href={channel.href} className="admin-content-ledger-row">
        <span className="admin-content-ledger-icon"><Icon /></span>
        <span className="admin-content-ledger-name"><strong>{channel.label}</strong></span>
        <span className="admin-content-ledger-value">
          <small>总量</small>
          <b>{channel.available ? formatAdminNumber(channel.total) : '—'}</b>
        </span>
        <span className="admin-content-ledger-value">
          <small>已发布</small>
          <b>{channel.available ? formatAdminNumber(channel.published) : '—'}</b>
        </span>
        <span className="admin-content-ledger-value">
          <small>待发布</small>
          <b>{channel.available ? formatAdminNumber(channel.draft) : '—'}</b>
        </span>
        <ArrowRight />
      </Link>
    </li>
  )
}

function dashboardStatus(failedModules: number, hasAnyDashboardData: boolean) {
  if (!failedModules)
    return { label: '已更新', tone: 'is-ready' }
  if (hasAnyDashboardData)
    return { label: '部分数据不可用', tone: 'is-warning' }
  return { label: '数据暂不可用', tone: 'is-danger' }
}

function EmptyPanel({ description, success = false, title }: { description: string, success?: boolean, title: string }) {
  return (
    <div className="admin-dashboard-empty">
      {success ? <CircleCheckFill /> : <Globe />}
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value))
}

function formatUpdateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function Metric({ attention = false, available = true, detail, href, icon: Icon, label, value }: {
  attention?: boolean
  available?: boolean
  detail: string
  href?: string
  icon: DashboardIcon
  label: string
  value: number
}) {
  const content = (
    <>
      <span className="admin-kpi-icon"><Icon /></span>
      <span className="admin-kpi-copy">
        <small>{label}</small>
        <strong className={attention ? 'is-attention' : ''}>{available ? formatAdminNumber(value) : '—'}</strong>
        <em>{available ? detail : '数据暂不可用'}</em>
      </span>
      {href ? <ArrowRight className="admin-kpi-arrow" /> : null}
    </>
  )
  return href
    ? <Link href={href} className="admin-kpi-item">{content}</Link>
    : <div className="admin-kpi-item">{content}</div>
}

function ReviewQueueRow({ queue }: { queue: AdminDashboardReviewQueue }) {
  const Icon = CHANNEL_ICONS[queue.id]
  return (
    <li>
      <Link href={queue.href} className="admin-dashboard-queue-row">
        <Icon />
        <span>
          <strong>{queue.label}</strong>
          <small>
            {queue.available ? queue.description : '数据暂不可用'}
            {queue.securityPending ? ` · ${formatAdminNumber(queue.securityPending)} 项待评测` : ''}
          </small>
        </span>
        <b className={queue.available && queue.count ? 'has-items' : ''}>{queue.available ? formatAdminNumber(queue.count) : '—'}</b>
        <ArrowRight />
      </Link>
    </li>
  )
}

function runtimeLabel(data: AdminDashboardData) {
  if (!data.security.available)
    return '执行节点状态未知'
  if (!data.security.serviceEnabled || data.security.status === 'paused')
    return '安全评测已暂停'
  if (data.security.status === 'ready')
    return '安全评测运行正常'
  if (data.security.status === 'starting')
    return '执行节点连接中'
  return '执行节点异常'
}

function runtimeTone(data: AdminDashboardData) {
  if (data.security.status === 'ready')
    return 'is-ready'
  if (data.security.status === 'starting')
    return 'is-warning'
  return 'is-danger'
}

function SectionHeading({ action, description, title }: { action?: React.ReactNode, description: string, title: string }) {
  return (
    <div className="admin-dashboard-section-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function TopSiteMark({ logo, name }: { logo: string | null, name: string }) {
  const source = catalogIconSource(logo)
  return (
    <span aria-hidden="true" className="admin-top-site-mark">
      <span>{name.slice(0, 1).toUpperCase()}</span>
      {source
        ? (
            // Catalog icons can be remote object-storage assets.
            // eslint-disable-next-line next/no-img-element
            <img
              alt=""
              decoding="async"
              height={28}
              loading="lazy"
              src={source}
              width={28}
            />
          )
        : null}
    </span>
  )
}

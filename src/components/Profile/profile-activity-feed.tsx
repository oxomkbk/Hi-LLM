import { Check, Comments, Eye, Lock, ThumbsUp } from '@gravity-ui/icons'
import Link from 'next/link'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'

import { ContentUnavailable } from './community-showcase'
import styles from './profile.module.css'

import type { ProfileActivity } from '@/lib/account/profile-view-model'

interface ProfileActivityFeedProps {
  activity: {
    items: ProfileActivity[]
    partial: boolean
    status: 'error' | 'ready'
  }
  owner?: boolean
  returnTo: string
  targetPrefix: string
}

const STATE_LABELS: Record<ProfileActivity['state'], string> = {
  accepted: '回答被采纳',
  closed: '已关闭',
  open: '进行中',
  resolved: '已解决',
}

export function ProfileActivityFeed({ activity, owner = false, returnTo, targetPrefix }: ProfileActivityFeedProps) {
  if (activity.status === 'error')
    return <ContentUnavailable label="社区动态暂时无法读取" />
  if (!activity.items.length) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIndex}>00</span>
        <div>
          <strong>{owner ? '还没有公开讨论记录' : '这位创作者还没有公开讨论'}</strong>
          <p>{owner ? '发起一个问题，或回答社区里的真实困惑。' : '公开提问和回答会按时间出现在这里。'}</p>
        </div>
        {owner ? <Link href="/wonderland" className={styles.emptyAction}>前往妙妙屋</Link> : null}
      </div>
    )
  }

  return (
    <div className={styles.activityFeed}>
      <ReturnTargetRestorer ready />
      {activity.partial ? <p className={styles.partialNotice}>部分动态暂时无法读取，已展示其余公开记录。</p> : null}
      {activity.items.map((item) => {
        const targetId = returnTargetId(targetPrefix, item.id)
        return (
          <ConfigurableDetailLink
            key={item.id}
            id={targetId}
            contextualHref={buildContextualHref(item.href, returnTo, targetId)}
            href={item.href}
            className={styles.activityRow}
          >
            <span data-kind={item.kind} className={styles.activityType}>
              {item.kind === 'question' ? '提问' : '回答'}
            </span>
            <span className={styles.activityMain}>
              <strong>{item.title}</strong>
              <span className={styles.activitySubline}>
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                <span data-state={item.state} className={styles.activityState}>
                  {stateIcon(item.state)}
                  {STATE_LABELS[item.state]}
                </span>
              </span>
            </span>
            <span className={styles.activityMetrics}>
              {item.metrics.map(metric => (
                <span key={metric.label}>
                  {metric.label === '浏览' ? <Eye aria-hidden="true" /> : metric.label === '得票' ? <ThumbsUp aria-hidden="true" /> : <Comments aria-hidden="true" />}
                  {metric.value}
                  <small>{metric.label}</small>
                </span>
              ))}
            </span>
          </ConfigurableDetailLink>
        )
      })}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function stateIcon(state: ProfileActivity['state']) {
  if (state === 'closed')
    return <Lock aria-hidden="true" />
  if (state === 'accepted' || state === 'resolved')
    return <Check aria-hidden="true" />
  return null
}

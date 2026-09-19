'use client'

import { Bell, Check, Comments } from '@gravity-ui/icons'
import { Button, toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate, toIsoDateTime } from '@/lib/utils'

import styles from './notification.module.css'

export interface NotificationItem {
  actor_name: string | null
  created_at: string
  id: string
  news_slug: string | null
  news_title: string | null
  question_slug: string | null
  question_title: string | null
  read_at: string | null
  type: string
}

type NotificationFilter = 'all' | 'discussion' | 'status' | 'unread'

const FILTERS: Array<{ id: NotificationFilter, label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'unread', label: '未读' },
  { id: 'discussion', label: '互动' },
  { id: 'status', label: '状态' },
]

export default function WonderlandNotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all')
  const [readIds, setReadIds] = useState(() => new Set(items.filter(item => item.read_at).map(item => item.id)))
  const [pending, setPending] = useState(false)
  const unreadIds = items.filter(item => !readIds.has(item.id)).map(item => item.id)
  const visibleItems = useMemo(() => items.filter((item) => {
    if (activeFilter === 'unread')
      return !readIds.has(item.id)
    if (activeFilter === 'discussion')
      return item.type === 'new-answer' || item.type === 'new-comment'
    if (activeFilter === 'status')
      return item.type !== 'new-answer' && item.type !== 'new-comment'
    return true
  }), [activeFilter, items, readIds])
  const groups = useMemo(() => groupNotifications(visibleItems), [visibleItems])

  const markAllRead = async () => {
    if (!unreadIds.length)
      return
    setPending(true)
    const previous = readIds
    setReadIds(new Set(items.map(item => item.id)))
    try {
      await request('/wonderland/notifications', { body: JSON.stringify({ ids: unreadIds }), method: 'PATCH' })
      toast.success('通知已全部标记为已读')
      router.refresh()
    }
    catch {
      setReadIds(previous)
    }
    finally { setPending(false) }
  }

  const markOneRead = (id: string) => {
    if (readIds.has(id))
      return
    setReadIds(current => new Set(current).add(id))
    void request('/wonderland/notifications', {
      body: JSON.stringify({ ids: [id] }),
      keepalive: true,
      method: 'PATCH',
    }).catch(() => {
      setReadIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    })
  }

  return (
    <section aria-label="通知列表" className={styles.inbox}>
      <div className={styles.toolbar}>
        <div aria-label="筛选通知" role="tablist" className={styles.filters}>
          {FILTERS.map(filter => (
            <button
              key={filter.id}
              aria-selected={activeFilter === filter.id}
              role="tab"
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={activeFilter === filter.id ? styles.filterActive : undefined}
            >
              {filter.label}
              {filter.id === 'unread' && unreadIds.length ? <span>{unreadIds.length}</span> : null}
            </button>
          ))}
        </div>
        {unreadIds.length
          ? (
              <Button size="sm" variant="tertiary" isPending={pending} onPress={() => void markAllRead()}>
                <Check />
                全部已读
              </Button>
            )
          : (
              <span className={styles.allRead}>
                <Check aria-hidden="true" />
                {' '}
                已全部阅读
              </span>
            )}
      </div>
      <ReturnTargetRestorer ready />
      <div role="tabpanel" className={styles.list}>
        {groups.map(group => (
          <section key={group.label} className={styles.group}>
            <h2>{group.label}</h2>
            <div>
              {group.items.map((item) => {
                const targetId = returnTargetId('wonderland-notification', item.id)
                const unread = !readIds.has(item.id)
                return (
                  <ConfigurableDetailLink
                    key={item.id}
                    id={targetId}
                    contextualHref={buildContextualHref(notificationHref(item), '/wonderland/notifications', targetId)}
                    data-unread={unread || undefined}
                    href={notificationHref(item)}
                    onClick={() => markOneRead(item.id)}
                    className={styles.item}
                  >
                    <span className={styles.itemIcon}><NotificationIcon type={item.type} /></span>
                    <span className={styles.itemBody}>
                      <span className={styles.itemLine}>
                        <strong>{notificationText(item)}</strong>
                        <time dateTime={toIsoDateTime(item.created_at)}>{formatDate(item.created_at, 'datetime')}</time>
                      </span>
                      <span className={styles.subject}>{item.question_title || item.news_title || '查看相关内容'}</span>
                    </span>
                    {unread ? <span aria-label="未读" className={styles.unreadDot} /> : null}
                  </ConfigurableDetailLink>
                )
              })}
            </div>
          </section>
        ))}
        {!visibleItems.length
          ? (
              <div className={styles.empty}>
                <span><Bell aria-hidden="true" /></span>
                <h2>{items.length ? '没有符合条件的通知' : '这里还很安静'}</h2>
                <p>{items.length ? '换一个筛选条件查看其他消息。' : '当有人回答、评论或采纳你的内容时，会在这里提醒你。'}</p>
              </div>
            )
          : null}
      </div>
    </section>
  )
}

function groupNotifications(items: NotificationItem[]) {
  const groups = new Map<string, NotificationItem[]>()
  items.forEach((item) => {
    const label = notificationDateGroup(item.created_at)
    groups.set(label, [...(groups.get(label) ?? []), item])
  })
  return Array.from(groups, ([label, groupedItems]) => ({ items: groupedItems, label }))
}

function notificationDateGroup(value: string) {
  const date = new Date(value)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const day = Math.round((todayStart - targetStart) / 86_400_000)
  if (day === 0)
    return '今天'
  if (day === 1)
    return '昨天'
  if (day < 7)
    return '本周'
  return '更早'
}

function notificationHref(item: NotificationItem) {
  return item.news_slug ? `/wonderland/news/${item.news_slug}#discussion` : `/wonderland/questions/${item.question_slug}`
}

function NotificationIcon({ type }: { type: string }) {
  if (type === 'new-answer' || type === 'new-comment')
    return <Comments aria-hidden="true" />
  if (type === 'answer-accepted' || type === 'answer-unaccepted')
    return <Check aria-hidden="true" />
  return <Bell aria-hidden="true" />
}

function notificationText(item: NotificationItem) {
  const actor = item.actor_name || '社区用户'
  const labels: Record<string, string> = {
    'answer-accepted': `${actor} 采纳了你的回答`,
    'answer-unaccepted': `${actor} 取消采纳你的回答`,
    'content-moderated': '管理员处理了你的内容',
    'new-answer': `${actor} 回答了你的问题`,
    'new-comment': `${actor} 回复了你的讨论`,
    'question-closed': '问题已被关闭',
    'question-reopened': '问题已重新开放',
  }
  return labels[item.type] || '妙妙屋有一条新消息'
}

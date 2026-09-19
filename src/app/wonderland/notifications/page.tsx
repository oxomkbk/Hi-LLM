import { ArrowLeft, Bell } from '@gravity-ui/icons'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getServerSession } from '@/lib/auth/session'
import { listWonderlandNotifications } from '@/lib/wonderland/repositories/community'

import WonderlandNotificationList from './notification-list'
import styles from './notification.module.css'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: `通知・妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}` }

export default async function WonderlandNotificationsPage() {
  const session = await getServerSession()
  if (!session || session.user.status !== 'active')
    redirect('/login?callbackURL=%2Fwonderland%2Fnotifications')
  const items = await listWonderlandNotifications(session.user.id)
  const unreadCount = items.filter(item => !item.read_at).length
  return (
    <div className="wonderland-full-bleed">
      <div className="wonderland-page min-h-screen">
        <main className={`${styles.page} wonderland-content`}>
          <header className={styles.header}>
            <div className={styles.headerCopy}>
              <Link href="/wonderland" className={styles.backLink}>
                <ArrowLeft aria-hidden="true" />
                妙妙屋
              </Link>
              <p className={styles.eyebrow}>消息中心</p>
              <h1>通知</h1>
              <p className={styles.intro}>回答、评论和内容状态，集中在一处处理。</p>
            </div>
            <div aria-label="通知概览" className={styles.inboxSummary}>
              <span className={styles.summaryIcon}><Bell aria-hidden="true" /></span>
              <span>
                <strong>{unreadCount}</strong>
                <small>条未读</small>
              </span>
              <span>
                <strong>{items.length}</strong>
                <small>条近期消息</small>
              </span>
            </div>
          </header>
          <WonderlandNotificationList items={items} />
        </main>
      </div>
    </div>
  )
}

import { CrownDiamond, Eye, Heart, Layers, Sparkles } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'

import { isReadySlice } from '@/lib/account/profile-types'

import styles from './profile.module.css'

import type { DataSlice, RecentWork } from '@/lib/account/profile-types'
import type { WonderBadgeProgress } from '@/lib/wonderland/domain'

const BADGE_ICONS = { crown: CrownDiamond, eye: Eye, heart: Heart, layers: Layers, spark: Sparkles }

export function AchievementShelf({
  badges,
  compact = false,
}: {
  badges: DataSlice<WonderBadgeProgress[]>
  compact?: boolean
}) {
  if (!isReadySlice(badges))
    return <ContentUnavailable label="成就记录暂时无法读取" />
  if (!badges.data.length)
    return <div className={styles.emptyCompact}>发布作品后，这里会记录你的创作里程碑。</div>

  return (
    <div className={`${styles.badgeShelf} ${compact ? styles.badgeShelfCompact : ''}`}>
      {badges.data.map((badge) => {
        const Icon = BADGE_ICONS[badge.icon]
        const percentage = badge.threshold > 0 ? Math.min(100, Math.round(badge.progress / badge.threshold * 100)) : 0
        return (
          <article key={badge.id} data-earned={badge.earned || undefined} data-tone={badge.tone} className={styles.badgeItem}>
            <span className={styles.badgeIcon}><Icon aria-hidden="true" /></span>
            <span className={styles.badgeCopy}>
              <strong>{badge.name}</strong>
              <small>{badge.earned ? badge.description : `${Math.min(badge.progress, badge.threshold)} / ${badge.threshold}`}</small>
            </span>
            {!badge.earned
              ? (
                  <span aria-label={`完成度 ${percentage}%`} className={styles.badgeProgress}>
                    <i style={{ width: `${percentage}%` }} />
                  </span>
                )
              : <span className={styles.badgeEarned}>已获得</span>}
          </article>
        )
      })}
    </div>
  )
}

export function ContentUnavailable({ label }: { label: string }) {
  return (
    <div role="status" className={styles.errorState}>
      <span aria-hidden="true">!</span>
      <p>
        {label}
        ，稍后刷新再试。
      </p>
    </div>
  )
}

export function ProfileWorkShowcase({
  owner = false,
  variant = 'public',
  works,
}: {
  owner?: boolean
  variant?: 'account' | 'public'
  works: DataSlice<RecentWork[]>
}) {
  if (!isReadySlice(works))
    return <ContentUnavailable label="作品暂时无法读取" />
  if (!works.data.length) {
    return (
      <div className={styles.emptyExhibition}>
        <div className={styles.emptyPrimary}>
          <span aria-hidden="true" className={styles.emptyArtwork}>
            <i />
            <i />
            <i />
          </span>
          <div>
            <span className={styles.emptyOverline}>{variant === 'account' ? '你的作品集' : '公开作品集'}</span>
            <strong>{variant === 'account' ? '把第一件作品带到这里' : '第一件作品正在准备中'}</strong>
            <p>{owner ? '把正在做的项目带到作品广场，建立第一张创作名片。' : '这位创作者发布作品后，会优先陈列在这里。'}</p>
            {owner
              ? <Link href="/wonderland/works/new" className={styles.emptyAction}>发布第一件作品</Link>
              : <Link href="/wonderland/works" className={styles.emptyAction}>前往作品广场</Link>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.workGrid}>
      {works.data.map((work, index) => (
        <Link
          key={work.id}
          data-featured={index === 0 || undefined}
          href={`/wonderland/works/${work.slug}`}
          className={styles.workCard}
        >
          <span className={styles.workCover}>
            <Image
              alt={`${work.title} 封面`}
              fill
              loading={index === 0 ? 'eager' : 'lazy'}
              sizes={index === 0 ? '(max-width: 768px) 100vw, 720px' : '(max-width: 768px) 100vw, 360px'}
              src={`/api/files/${work.coverFileId}`}
            />
            {work.featured
              ? (
                  <span className={styles.featuredMark}>
                    <CrownDiamond aria-hidden="true" />
                    精选
                  </span>
                )
              : null}
          </span>
          <span className={styles.workCardBody}>
            <span className={styles.workKind}>{workKindLabel(work.kind)}</span>
            <strong className={styles.workTitle}>{work.title}</strong>
            <span className={styles.workSummary}>{work.summary}</span>
            <span className={styles.workMeta}>
              <span>
                <Heart aria-hidden="true" />
                {work.likeCount}
              </span>
              <span>
                <Eye aria-hidden="true" />
                {work.viewCount}
              </span>
              <time dateTime={work.publishedAt}>{formatMonth(work.publishedAt)}</time>
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function workKindLabel(kind: string) {
  const labels: Record<string, string> = {
    app: '应用',
    game: '游戏',
    library: '开源库',
    other: '社区作品',
    plugin: '插件',
    template: '模板',
  }
  return labels[kind] ?? '社区作品'
}

import { Eye, Heart } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'

import styles from '@/app/wonderland/works/works.module.css'
import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { hasVisibleEngagement, visibleWorkTags } from '@/lib/wonderland/work-card-presentation'
import { WORK_KIND_LABELS } from '@/lib/wonderland/work-kinds'

import type { WonderWorkListItem } from '@/lib/wonderland/domain'

export default function WonderlandWorkCard({ compact = false, priority = false, returnTo, work }: { compact?: boolean, priority?: boolean, returnTo?: string, work: WonderWorkListItem }) {
  const detailHref = `/wonderland/works/${work.slug}`
  const targetId = returnTargetId('wonderland-work', work.id)
  const contextualHref = returnTo ? buildContextualHref(detailHref, returnTo, targetId) : undefined
  const tags = visibleWorkTags(work.tags)
  const showEngagement = hasVisibleEngagement(work.like_count, work.view_count)

  return (
    <article id={targetId} data-compact={compact || undefined} tabIndex={-1} className={styles.card}>
      <ConfigurableDetailLink aria-label={`查看作品：${work.title}`} contextualHref={contextualHref} href={detailHref} className={styles.coverLink}>
        <Image
          alt={`${work.title} 作品封面`}
          fill
          loading={priority ? 'eager' : 'lazy'}
          sizes={compact ? '(max-width: 760px) 100vw, 33vw' : '(max-width: 760px) 100vw, (max-width: 1080px) 50vw, 33vw'}
          src={`/api/files/${work.cover_file_id}`}
          className={styles.cover}
        />
        <span className={styles.kind}>{WORK_KIND_LABELS[work.kind]}</span>
      </ConfigurableDetailLink>
      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <h3><ConfigurableDetailLink contextualHref={contextualHref} href={detailHref}>{work.title}</ConfigurableDetailLink></h3>
          {showEngagement
            ? (
                <div aria-label="作品数据" className={styles.metrics}>
                  <span title="喜欢">
                    <Heart aria-hidden="true" />
                    {work.like_count}
                  </span>
                  <span title="浏览">
                    <Eye aria-hidden="true" />
                    {work.view_count}
                  </span>
                </div>
              )
            : null}
        </div>
        <p>{work.summary}</p>
        {tags.length > 0
          ? (
              <div aria-label="作品标签" className={styles.tags}>
                {tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>
            )
          : null}
        <footer className={styles.cardFooter}>
          <Link href={`/users/${work.author.id}`}>{work.author.name}</Link>
          <time dateTime={new Date(work.published_at).toISOString()}>{formatWorkDate(work.published_at)}</time>
        </footer>
      </div>
    </article>
  )
}

function formatWorkDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

import { ArrowLeft, ArrowUpRightFromSquare, Code, Eye, Heart } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import WonderlandContentRenderer from '@/components/Wonderland/content-renderer'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { getServerSession } from '@/lib/auth/session'
import { safeReturnTo } from '@/lib/navigation/return-context'
import { findPublicWorkBySlug, getWorkViewerState } from '@/lib/wonderland/repositories/works'
import { WORK_KIND_LABELS } from '@/lib/wonderland/work-kinds'

import styles from '../works.module.css'
import WorkEngagement from './work-engagement'

import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const work = await findPublicWorkBySlug(slug)
  return work
    ? {
        alternates: { canonical: `/wonderland/works/${work.slug}` },
        description: work.summary,
        openGraph: { description: work.summary, images: [`/api/files/${work.cover_file_id}`], title: work.title, type: 'article' },
        title: `${work.title}・作品广场`,
      }
    : { title: '作品不存在・作品广场' }
}

export default async function WonderlandWorkDetailPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const [work, session] = await Promise.all([
    findPublicWorkBySlug(slug),
    getServerSession().catch(() => null),
  ])
  if (!work)
    notFound()
  const authenticated = session?.user.status === 'active'
  const viewer = authenticated ? await getWorkViewerState(work.id, session.user.id) : { liked: false }
  const detailHref = `/wonderland/works/${work.slug}`
  const returnHref = safeReturnTo(query.returnTo, '/wonderland/works', {
    exactPathnames: ['/wonderland', '/wonderland/works'],
  })

  return (
    <div className="wonderland-full-bleed">
      <div className={`wonderland-page ${styles.detailPage}`}>
        <header className={styles.detailMasthead}>
          <div className="wonderland-content">
            <Link href={returnHref} className="wonderland-back-link">
              <ArrowLeft />
              返回作品广场
            </Link>
            <div className={styles.detailLayout}>
              <div className={styles.detailCover}>
                <Image alt={`${work.title} 作品封面`} fill priority sizes="(max-width: 980px) 100vw, 64vw" src={`/api/files/${work.cover_file_id}`} />
              </div>
              <div className={styles.detailIntro}>
                <p className="wonderland-kicker">
                  {WORK_KIND_LABELS[work.kind]}
                  {' '}
                  / COMMUNITY WORK
                </p>
                <h1>{work.title}</h1>
                <p>{work.summary}</p>
                <div className={styles.detailMeta}>
                  <span>
                    由
                    <Link href={`/users/${work.author.id}`}>{work.author.name}</Link>
                    {' '}
                    发布
                  </span>
                  <span>{formatDate(work.published_at)}</span>
                </div>
                {work.tags.length ? <div className={styles.tags}>{work.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null}
                <div className={styles.detailActions}>
                  {work.demo_url
                    ? (
                        <a href={work.demo_url} rel="nofollow noopener noreferrer" target="_blank">
                          <ArrowUpRightFromSquare />
                          在线体验
                        </a>
                      )
                    : null}
                  <a href={work.source_url} rel="nofollow noopener noreferrer" target="_blank" className={styles.secondary}>
                    <Code />
                    源代码 / 下载
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className={`wonderland-content ${styles.articleLayout}`}>
          <article className={styles.article}>
            <p className={styles.articleLabel}>ABOUT THIS WORK</p>
            <WonderlandContentRenderer document={work.content_json} />
          </article>
          <aside className={styles.detailAside}>
            <section>
              <h2>创作者</h2>
              <Link href={`/users/${work.author.id}`} className={styles.creator}>
                <span className={styles.creatorMark}>{work.author.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{work.author.name}</strong>
                  <small>查看个人主页与更多作品</small>
                </span>
              </Link>
            </section>
            <section>
              <h2>作品数据</h2>
              <div className={styles.detailNumbers}>
                <div>
                  <strong>{work.like_count}</strong>
                  <span>
                    <Heart />
                    喜欢
                  </span>
                </div>
                <div>
                  <strong>{work.view_count}</strong>
                  <span>
                    <Eye />
                    有效浏览
                  </span>
                </div>
              </div>
              <WorkEngagement
                canLike={authenticated}
                initialCount={work.like_count}
                initialLiked={viewer.liked}
                loginHref={createLoginUrl(detailHref)}
                workId={work.id}
              />
            </section>
            <section>
              <h2>外链说明</h2>
              <p className="mt-2 text-xs leading-6 text-muted">作品文件由创作者托管在外部平台。打开、下载或运行前，请自行核对来源与安全性。</p>
            </section>
          </aside>
        </main>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

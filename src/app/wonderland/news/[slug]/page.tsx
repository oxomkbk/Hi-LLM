import { ArrowLeft, Comments } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import CommentComposer from '@/components/Wonderland/comment-composer'
import CommentThread from '@/components/Wonderland/comment-thread'
import WonderlandContentRenderer from '@/components/Wonderland/content-renderer'
import { buildContextualHref, returnTargetId, safeReturnTo } from '@/lib/navigation/return-context'
import { formatDate, toIsoDateTime } from '@/lib/utils'
import { listPublicWonderComments } from '@/lib/wonderland/repositories/comments'
import { findPublicWonderlandNewsBySlug, listRecentPublicWonderlandNews } from '@/lib/wonderland/repositories/news'

import type { Metadata } from 'next'

interface NewsPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const NEWS_RETURN_POLICY = {
  exactPathnames: ['/wonderland', '/wonderland/news', '/wonderland/notifications'],
} as const

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
  const article = await findPublicWonderlandNewsBySlug((await params).slug)
  const description = article?.seo_description || article?.summary
  const coverImage = article?.cover_file_id ? `/api/files/${article.cover_file_id}` : undefined
  return article
    ? {
        alternates: { canonical: `/wonderland/news/${article.slug}` },
        description,
        openGraph: {
          description,
          images: coverImage ? [{ alt: article.title, url: coverImage }] : undefined,
          title: article.seo_title || article.title,
          type: 'article',
          url: `/wonderland/news/${article.slug}`,
        },
        title: article.seo_title || `${article.title} ・ 妙妙屋新闻`,
        twitter: coverImage
          ? { card: 'summary_large_image', description, images: [coverImage], title: article.seo_title || article.title }
          : undefined,
      }
    : { title: '新闻不存在 ・ 妙妙屋' }
}

export default async function WonderlandNewsPage({ params, searchParams }: NewsPageProps) {
  const { slug } = await params
  const query = await searchParams
  const article = await findPublicWonderlandNewsBySlug(slug)
  if (!article)
    notFound()
  const [comments, recent] = await Promise.all([
    listPublicWonderComments({ newsId: article.id }),
    listRecentPublicWonderlandNews(slug, 4),
  ])
  const backHref = safeReturnTo(query.returnTo, '/wonderland', NEWS_RETURN_POLICY)
  const returnPath = buildContextualHref(`/wonderland/news/${article.slug}`, backHref)
  const readingMinutes = estimateReadingMinutes(article.content_text)
  return (
    <div className="wonderland-full-bleed">
      <div className="wonderland-page wonderland-news-detail-page">
        <div className="wonderland-news-detail-content">
          <Link href={backHref} className="wonderland-back-link">
            <ArrowLeft />
            {backHref.startsWith('/wonderland/news') ? '返回新闻列表' : '返回妙妙屋'}
          </Link>
          <div className="wonderland-news-reading-layout">
            <article className="wonderland-news-article">
              <header>
                <span className="wonderland-category-label">{article.category.name}</span>
                <h1>{article.title}</h1>
                <p>{article.summary}</p>
                <div className="wonderland-news-byline">
                  <span>{article.author.name}</span>
                  <time dateTime={toIsoDateTime(article.published_at)}>{formatDate(article.published_at, 'datetime')}</time>
                  <span>
                    约
                    {' '}
                    {readingMinutes}
                    {' '}
                    分钟阅读
                  </span>
                </div>
              </header>
              {article.cover_file_id
                ? (
                    <figure className="wonderland-news-cover">
                      <Image
                        alt={article.title}
                        height={900}
                        priority
                        sizes="(max-width: 1024px) 100vw, 860px"
                        src={`/api/files/${article.cover_file_id}`}
                        width={1600}
                      />
                    </figure>
                  )
                : null}
              <WonderlandContentRenderer document={article.content_json} />
              <section aria-labelledby="wonderland-news-discussion-title" id="discussion" className="wonderland-news-discussion">
                <header>
                  <div>
                    <span>DISCUSSION</span>
                    <h2 id="wonderland-news-discussion-title">文章讨论</h2>
                  </div>
                  <p>
                    <Comments />
                    {article.comment_count}
                    {' '}
                    条评论
                  </p>
                </header>
                <CommentThread comments={comments} returnPath={returnPath} target={{ newsId: article.id, type: 'news' }} />
                <CommentComposer target={{ newsId: article.id, type: 'news' }} />
              </section>
            </article>
            {recent.length
              ? (
                  <aside aria-label="最近发布" className="wonderland-news-recent">
                    <div className="wonderland-news-recent-heading">
                      <span>RECENT</span>
                      <h2>最近发布</h2>
                    </div>
                    <ol>
                      {recent.map((item, index) => {
                        const archiveTarget = backHref.startsWith('/wonderland/news')
                          ? returnTargetId('wonderland-news-archive', item.id)
                          : undefined
                        return (
                          <li key={item.id}>
                            <ConfigurableDetailLink
                              contextualHref={buildContextualHref(`/wonderland/news/${item.slug}`, backHref, archiveTarget)}
                              href={`/wonderland/news/${item.slug}`}
                            >
                              <span>{String(index + 1).padStart(2, '0')}</span>
                              <div>
                                <small>
                                  {item.category.name}
                                  {' '}
                                  ·
                                  {' '}
                                  {formatDate(item.published_at)}
                                </small>
                                <strong>{item.title}</strong>
                              </div>
                            </ConfigurableDetailLink>
                          </li>
                        )
                      })}
                    </ol>
                    <Link href="/wonderland/news" className="wonderland-news-recent-all">
                      查看全部新闻
                      <span aria-hidden="true">→</span>
                    </Link>
                  </aside>
                )
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function estimateReadingMinutes(content: string) {
  const compact = content.replace(/\s+/g, '')
  return Math.max(1, Math.ceil(compact.length / 420))
}

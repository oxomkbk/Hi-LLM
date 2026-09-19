import { ArrowLeft, ArrowRight, Magnifier } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { getPaginationTokens } from '@/lib/pagination'
import {
  listPublicWonderlandNewsCategories,
  listPublicWonderlandNewsPage,
} from '@/lib/wonderland/repositories/news'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/wonderland/news' },
  description: '浏览妙妙屋社区公告、开发入门教程与专题文章。',
  openGraph: {
    description: '浏览妙妙屋社区公告、开发入门教程与专题文章。',
    title: '社区新闻 ・ 妙妙屋',
    type: 'website',
    url: '/wonderland/news',
  },
  title: `社区新闻 ・ 妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
}

interface WonderlandNewsArchivePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function WonderlandNewsArchivePage({ searchParams }: WonderlandNewsArchivePageProps) {
  const query = await searchParams
  const category = clean(first(query.category), 100)
  const q = clean(first(query.q), 80)
  const requestedPage = readPage(first(query.page))
  const [archive, categoryRows] = await Promise.all([
    listPublicWonderlandNewsPage({ categorySlug: category, page: requestedPage, pageSize: 12, q }),
    listPublicWonderlandNewsCategories(),
  ])
  const categories = categoryRows.flatMap(root => root.depth === 0
    ? [root, ...categoryRows.filter(child => child.parent_id === root.id)]
    : [])
  const currentHref = newsArchiveHref({ category, page: archive.page, q })

  return (
    <div className="wonderland-full-bleed">
      <main className="wonderland-page wonderland-news-archive-page">
        <header className="wonderland-news-archive-masthead">
          <div className="wonderland-content">
            <Link href="/wonderland#news" className="wonderland-back-link">
              <ArrowLeft aria-hidden="true" />
              返回妙妙屋
            </Link>
            <div className="wonderland-news-archive-title-row">
              <div>
                <p className="wonderland-kicker">NEWSROOM / ARCHIVE</p>
                <h1>社区新闻</h1>
                <p>社区公告、开发入门教程与值得保存的实践文章。</p>
              </div>
              <span>
                {archive.total}
                {' '}
                篇文章
              </span>
            </div>
          </div>
        </header>

        <section aria-labelledby="news-archive-title" className="wonderland-content wonderland-news-archive-body">
          <h2 id="news-archive-title" className="sr-only">新闻归档</h2>
          <form action="/wonderland/news" method="get" className="wonderland-news-archive-search">
            {category ? <input name="category" type="hidden" value={category} /> : null}
            <label>
              <Magnifier aria-hidden="true" />
              <span className="sr-only">搜索社区新闻</span>
              <input name="q" defaultValue={q} placeholder="搜索标题、摘要或正文关键词" />
            </label>
            <button type="submit">搜索</button>
          </form>

          <nav aria-label="新闻分类" className="wonderland-news-archive-categories">
            <Link href={newsArchiveHref({ q })} className={!category ? 'is-active' : ''}>全部</Link>
            {categories.map(item => (
              <Link
                key={item.id}
                href={newsArchiveHref({ category: item.slug, q })}
                className={category === item.slug ? 'is-active' : ''}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <ReturnTargetRestorer fallbackId="news-archive-grid" ready />

          {archive.list.length
            ? (
                <div id="news-archive-grid" className="wonderland-news-archive-grid">
                  {archive.list.map((article) => {
                    const targetId = returnTargetId('wonderland-news-archive', article.id)
                    return (
                      <ConfigurableDetailLink
                        key={article.id}
                        id={targetId}
                        contextualHref={buildContextualHref(`/wonderland/news/${article.slug}`, currentHref, targetId)}
                        href={`/wonderland/news/${article.slug}`}
                        className="wonderland-news-archive-card"
                      >
                        <div className="wonderland-news-archive-media">
                          {article.cover_file_id
                            ? (
                                <Image
                                  alt=""
                                  fill
                                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                  src={`/api/files/${article.cover_file_id}`}
                                />
                              )
                            : (
                                <div aria-hidden="true" className="wonderland-news-archive-fallback">
                                  <span>{article.category.name.slice(0, 1)}</span>
                                  <i />
                                </div>
                              )}
                        </div>
                        <div className="wonderland-news-archive-copy">
                          <div className="wonderland-news-archive-meta">
                            <span>{article.category.name}</span>
                            <time dateTime={new Date(article.published_at).toISOString()}>{formatDate(article.published_at)}</time>
                          </div>
                          <h3>{article.title}</h3>
                          <p>{article.summary}</p>
                          <strong>
                            阅读文章
                            <ArrowRight aria-hidden="true" />
                          </strong>
                        </div>
                      </ConfigurableDetailLink>
                    )
                  })}
                </div>
              )
            : (
                <div id="news-archive-grid" className="wonderland-news-archive-empty">
                  <span aria-hidden="true">0</span>
                  <div>
                    <h3>没有找到匹配的文章</h3>
                    <p>换一个关键词或分类，继续浏览社区内容。</p>
                    <Link href="/wonderland/news">查看全部文章</Link>
                  </div>
                </div>
              )}

          {archive.totalPages > 1
            ? (
                <nav aria-label="新闻分页" className="wonderland-news-archive-pagination">
                  {archive.page > 1
                    ? <Link aria-label="上一页" href={newsArchiveHref({ category, page: archive.page - 1, q })}><ArrowLeft aria-hidden="true" /></Link>
                    : <span aria-hidden="true" className="is-disabled"><ArrowLeft /></span>}
                  {getPaginationTokens(archive.page, archive.totalPages).map(item => item.type === 'ellipsis'
                    ? <span key={item.key} aria-hidden="true" className="is-ellipsis">…</span>
                    : (
                        <Link
                          key={item.key}
                          aria-current={item.value === archive.page ? 'page' : undefined}
                          aria-label={`第 ${item.value} 页`}
                          href={newsArchiveHref({ category, page: item.value, q })}
                        >
                          {item.value}
                        </Link>
                      ))}
                  {archive.page < archive.totalPages
                    ? <Link aria-label="下一页" href={newsArchiveHref({ category, page: archive.page + 1, q })}><ArrowRight aria-hidden="true" /></Link>
                    : <span aria-hidden="true" className="is-disabled"><ArrowRight /></span>}
                </nav>
              )
            : null}
        </section>
      </main>
    </div>
  )
}

function clean(value: string | undefined, maxLength: number) {
  const cleaned = value?.trim().slice(0, maxLength)
  return cleaned || undefined
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function newsArchiveHref(input: { category?: string, page?: number, q?: string }) {
  const search = new URLSearchParams()
  if (input.q)
    search.set('q', input.q)
  if (input.category)
    search.set('category', input.category)
  if (input.page && input.page > 1)
    search.set('page', String(input.page))
  const query = search.toString()
  return query ? `/wonderland/news?${query}` : '/wonderland/news'
}

function readPage(value?: string) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

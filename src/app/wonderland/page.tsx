import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Comments,
  Magnifier,
  PaperPlane,
} from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import NavigationAiAssistant from '@/components/NavigationAiAssistant'
import SubmissionAction from '@/components/submission/submission-action'
import WonderlandQuestionCard from '@/components/Wonderland/question-card'
import WonderlandWorkCard from '@/components/Wonderland/work-card'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { getPaginationTokens } from '@/lib/pagination'
import { WONDER_QUESTION_SORTS } from '@/lib/wonderland/domain'
import { getWonderlandPortal, listPublicQuestionPage } from '@/lib/wonderland/repositories/community'
import { listLatestPublicWorks } from '@/lib/wonderland/repositories/works'

import workStyles from './works/works.module.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/wonderland' },
  description: '一个用于提问、解答与获取社区新闻的专业交流空间。',
  openGraph: {
    description: '聚焦技术、产品与工具的专业问答社区与新闻中心。',
    title: '妙妙屋',
    type: 'website',
    url: '/wonderland',
  },
  title: `妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
}

interface WonderlandPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function WonderlandPage({ searchParams }: WonderlandPageProps) {
  const query = await searchParams
  const category = first(query.category)
  const q = first(query.q)?.slice(0, 80)
  const state = readState(first(query.state))
  const sort = readSort(first(query.sort))
  const tag = first(query.tag)
  const requestedPageNumber = readPage(first(query.page))
  const currentPageHref = currentWonderlandHref(query)
  const hasFilters = Boolean(category || q || state || tag || sort !== 'newest')
  const [portal, page, latestWorks] = await Promise.all([
    getWonderlandPortal({ includeQuestions: false, includeTags: false }),
    listPublicQuestionPage({ categorySlug: category, limit: 20, page: requestedPageNumber, q, sort, state, tagSlug: tag }),
    listLatestPublicWorks(3),
  ])
  const questions = page.list
  const questionCategories = portal.categories
    .filter(item => item.scope === 'question')
    .flatMap(root => [root, ...root.children])
  const leadNews = portal.news[0]
  const secondaryNews = portal.news.slice(1)

  return (
    <div className="wonderland-full-bleed">
      <div className="wonderland-page wonderland-home">
        <header className="wonderland-community-head">
          <div className="wonderland-content">
            <div className="wonderland-community-head-grid">
              <div>
                <h1>提问、讨论、解决问题</h1>
                <p className="wonderland-community-summary">
                  把问题说清楚，让好答案被后来者找到。
                </p>
              </div>
              <div className="wonderland-community-actions">
                <Link href="/wonderland/works" className="wonderland-secondary-button">
                  浏览社区作品
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <SubmissionAction ariaLabel="发布问题" channel="wonderland" href="/wonderland/ask" newWindow className="wonderland-primary-button">
                  <PaperPlane className="size-4" />
                  发布问题
                </SubmissionAction>
              </div>
            </div>
            <div className="wonderland-ai-search-dock">
              <NavigationAiAssistant scope="wonderland" />
            </div>
            <dl aria-label="妙妙屋数据" className="wonderland-community-stats">
              <div>
                <dt>问题</dt>
                <dd>{portal.stats.questionCount}</dd>
              </div>
              <div>
                <dt>回答</dt>
                <dd>{portal.stats.answerCount}</dd>
              </div>
              <div>
                <dt>已解决</dt>
                <dd>{portal.stats.resolvedCount}</dd>
              </div>
              <div>
                <dt>贡献者</dt>
                <dd>{portal.stats.memberCount}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section aria-label="社区目录" id="community-index" className="wonderland-community-index">
          <div className="wonderland-content">
            <nav aria-label="妙妙屋社区目录" className="wonderland-community-index-list">
              <Link href="#questions">
                <span aria-hidden="true">01</span>
                <span>
                  <strong>问答讨论</strong>
                  <small>找答案，也留下答案</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/wonderland/works">
                <span aria-hidden="true">02</span>
                <span>
                  <strong>作品广场</strong>
                  <small>看社区成员做了什么</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="#news">
                <span aria-hidden="true">03</span>
                <span>
                  <strong>社区新闻</strong>
                  <small>公告、专题与社区进展</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </section>

        <section aria-labelledby="wonderland-work-title" className={workStyles.homeShowcase}>
          <div className="wonderland-content">
            <div className="wonderland-section-bar">
              <div>
                <h2 id="wonderland-work-title">社区作品</h2>
              </div>
              <div className={workStyles.homeActions}>
                <SubmissionAction channel="work" href="/wonderland/works/new">发布作品</SubmissionAction>
                <Link href="/wonderland/works">
                  查看全部
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </div>
            {latestWorks.length
              ? <div className={workStyles.homeGrid}>{latestWorks.map(work => <WonderlandWorkCard key={work.id} compact returnTo={currentPageHref} work={work} />)}</div>
              : (
                  <div className={workStyles.empty}>
                    <h3>作品广场正在等待第一位创作者</h3>
                    <p>把已经可以打开或运行的代码作品带到这里。</p>
                    <SubmissionAction channel="work" href="/wonderland/works/new">发布第一个作品</SubmissionAction>
                  </div>
                )}
          </div>
        </section>

        <section aria-labelledby="wonderland-question-title" id="questions" className="wonderland-content wonderland-question-hub">
          <div className="wonderland-section-bar">
            <div>
              <h2 id="wonderland-question-title">{hasFilters ? '筛选结果' : '最新问题'}</h2>
            </div>
            <span>
              共
              {' '}
              {page.total}
              {' '}
              条
            </span>
          </div>

          <form action="/wonderland" method="get" className="wonderland-home-filter">
            {category ? <input name="category" type="hidden" value={category} /> : null}
            {tag ? <input name="tag" type="hidden" value={tag} /> : null}
            <label className="wonderland-home-search">
              <Magnifier className="size-4" />
              <span className="sr-only">搜索问题</span>
              <input name="q" defaultValue={q} placeholder="搜索问题" />
            </label>
            <select aria-label="问题状态" name="state" defaultValue={state ?? ''}>
              <option value="">全部状态</option>
              <option value="open">待解决</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
            <select aria-label="问题排序" name="sort" defaultValue={sort}>
              <option value="newest">最新发布</option>
              <option value="active">最近活跃</option>
              <option value="popular">热门优先</option>
            </select>
            <button type="submit">搜索</button>
          </form>

          <nav aria-label="问题分类" className="wonderland-question-categories">
            <Link href="/wonderland" className={!category ? 'is-active' : ''}>全部</Link>
            {questionCategories.map(item => (
              <Link key={item.id} href={`/wonderland?category=${encodeURIComponent(item.slug)}`} className={category === item.slug ? 'is-active' : ''}>
                {item.name}
              </Link>
            ))}
          </nav>

          <ReturnTargetRestorer fallbackId="questions" ready />

          {hasFilters
            ? (
                <div className="wonderland-home-filter-state">
                  <span>已应用筛选条件</span>
                  <Link href="/wonderland">清除筛选</Link>
                </div>
              )
            : null}

          <div className="wonderland-question-list">
            {questions.map(question => (
              <WonderlandQuestionCard
                key={question.id}
                question={question}
                returnTo={currentPageHref}
              />
            ))}
            {!questions.length
              ? (
                  <div className="wonderland-empty wonderland-home-empty">
                    <Comments className="size-8" />
                    <div>
                      <h3>还没有匹配的问题</h3>
                      <p>换个关键词，或者成为第一个发起讨论的人。</p>
                    </div>
                    <SubmissionAction ariaLabel="发布问题" channel="wonderland" href="/wonderland/ask" newWindow>发布问题</SubmissionAction>
                  </div>
                )
              : null}
          </div>

          {page.totalPages > 1
            ? (
                <footer className="wonderland-pagination-bar">
                  <div className="wonderland-pagination-navigation">
                    <span className="wonderland-pagination-summary">
                      第
                      {' '}
                      <strong>{page.page}</strong>
                      {' '}
                      /
                      {' '}
                      {page.totalPages}
                      {' '}
                      页
                    </span>
                    <nav aria-label="妙妙屋问题分页" className="wonderland-pagination-pages">
                      {page.page > 1
                        ? (
                            <Link
                              href={questionPageHref({ category, page: page.page - 1, q, sort, state, tag })}
                              rel="prev"
                              className="wonderland-pagination-direction"
                            >
                              <ChevronLeft aria-hidden="true" />
                              <span>上一页</span>
                            </Link>
                          )
                        : (
                            <span aria-disabled="true" className="wonderland-pagination-direction">
                              <ChevronLeft aria-hidden="true" />
                              <span>上一页</span>
                            </span>
                          )}
                      {getPaginationTokens(page.page, page.totalPages).map(token => token.type === 'ellipsis'
                        ? <span key={token.key} aria-hidden="true" className="wonderland-pagination-ellipsis">…</span>
                        : (
                            <Link
                              key={token.key}
                              aria-current={token.value === page.page ? 'page' : undefined}
                              href={questionPageHref({ category, page: token.value!, q, sort, state, tag })}
                              className="wonderland-pagination-number"
                            >
                              {token.value}
                            </Link>
                          ))}
                      {page.page < page.totalPages
                        ? (
                            <Link
                              href={questionPageHref({ category, page: page.page + 1, q, sort, state, tag })}
                              rel="next"
                              className="wonderland-pagination-direction"
                            >
                              <span>下一页</span>
                              <ChevronRight aria-hidden="true" />
                            </Link>
                          )
                        : (
                            <span aria-disabled="true" className="wonderland-pagination-direction">
                              <span>下一页</span>
                              <ChevronRight aria-hidden="true" />
                            </span>
                          )}
                    </nav>
                  </div>
                  <form aria-label="妙妙屋问题页码跳转" action="/wonderland" method="get" className="catalog-page-jump">
                    {category ? <input name="category" type="hidden" value={category} /> : null}
                    {q ? <input name="q" type="hidden" value={q} /> : null}
                    {state ? <input name="state" type="hidden" value={state} /> : null}
                    {sort !== 'newest' ? <input name="sort" type="hidden" value={sort} /> : null}
                    {tag ? <input name="tag" type="hidden" value={tag} /> : null}
                    <label htmlFor="wonderland-page-jump">跳至</label>
                    <input
                      aria-label="输入页码"
                      id="wonderland-page-jump"
                      name="page"
                      type="number"
                      autoComplete="off"
                      defaultValue={page.page}
                      inputMode="numeric"
                      max={page.totalPages}
                      min={1}
                    />
                    <span>
                      /
                      {' '}
                      {page.totalPages}
                      {' '}
                      页
                    </span>
                    <button type="submit">跳转</button>
                  </form>
                </footer>
              )
            : null}
        </section>

        <section aria-labelledby="wonderland-news-title" id="news" className="wonderland-news-floor">
          <div className="wonderland-content">
            <div className="wonderland-section-bar">
              <div>
                <h2 id="wonderland-news-title">社区新闻</h2>
              </div>
              <div className="wonderland-section-bar-actions">
                <Link href="/wonderland/news">
                  查看全部
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </div>

            {leadNews
              ? (
                  <div className="wonderland-news-layout">
                    <ConfigurableDetailLink
                      id={returnTargetId('wonderland-news', leadNews.id)}
                      contextualHref={buildContextualHref(
                        `/wonderland/news/${leadNews.slug}`,
                        currentPageHref,
                        returnTargetId('wonderland-news', leadNews.id),
                      )}
                      href={`/wonderland/news/${leadNews.slug}`}
                      className="wonderland-news-lead"
                    >
                      <div className="wonderland-news-lead-media">
                        {leadNews.cover_file_id
                          ? (
                              <Image
                                alt={leadNews.title}
                                fill
                                sizes="(max-width: 860px) 100vw, 54vw"
                                src={`/api/files/${leadNews.cover_file_id}`}
                              />
                            )
                          : <div aria-hidden="true" className="wonderland-news-placeholder">W</div>}
                      </div>
                      <div className="wonderland-news-lead-copy">
                        <div>
                          <span>{leadNews.category.name}</span>
                          <time dateTime={new Date(leadNews.published_at).toISOString()}>{formatDate(leadNews.published_at)}</time>
                        </div>
                        <h3>{leadNews.title}</h3>
                        <p>{leadNews.summary}</p>
                        <strong>
                          阅读全文
                          <ArrowRight className="size-4" />
                        </strong>
                      </div>
                    </ConfigurableDetailLink>

                    {secondaryNews.length
                      ? (
                          <div className="wonderland-news-list">
                            {secondaryNews.map((article, index) => {
                              const targetId = returnTargetId('wonderland-news', article.id)

                              return (
                                <ConfigurableDetailLink
                                  key={article.id}
                                  id={targetId}
                                  contextualHref={buildContextualHref(`/wonderland/news/${article.slug}`, currentPageHref, targetId)}
                                  href={`/wonderland/news/${article.slug}`}
                                >
                                  <div className="wonderland-news-list-media">
                                    {article.cover_file_id
                                      ? (
                                          <Image
                                            alt=""
                                            fill
                                            sizes="112px"
                                            src={`/api/files/${article.cover_file_id}`}
                                          />
                                        )
                                      : <span aria-hidden="true">{String(index + 2).padStart(2, '0')}</span>}
                                  </div>
                                  <div className="wonderland-news-list-copy">
                                    <small>
                                      <span>{String(index + 2).padStart(2, '0')}</span>
                                      {article.category.name}
                                      {' '}
                                      ·
                                      {' '}
                                      {formatDate(article.published_at)}
                                    </small>
                                    <h3>{article.title}</h3>
                                    <p>{article.summary}</p>
                                  </div>
                                </ConfigurableDetailLink>
                              )
                            })}
                          </div>
                        )
                      : null}
                  </div>
                )
              : (
                  <div className="wonderland-news-empty">
                    <span>NEWSROOM</span>
                    <div>
                      <h3>新闻区已就位</h3>
                      <p>社区公告和专题文章发布后会在这里统一呈现。</p>
                    </div>
                  </div>
                )}
          </div>
        </section>
      </div>
    </div>
  )
}

function currentWonderlandHref(query: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]
    values.forEach((item) => {
      if (item !== undefined)
        search.append(key, item)
    })
  }
  const value = search.toString()
  return value ? `/wonderland?${value}` : '/wonderland'
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function questionPageHref(input: { category?: string, page: number, q?: string, sort: import('@/lib/wonderland/domain').WonderQuestionSort, state?: string, tag?: string }) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value)
      search.set(key, String(value))
  }
  if (input.page === 1)
    search.delete('page')
  if (input.sort === 'newest')
    search.delete('sort')
  const query = search.toString()
  return query ? `/wonderland?${query}` : '/wonderland'
}

function readPage(value?: string) {
  const parsed = Number(value ?? 1)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1
}

function readSort(value?: string): import('@/lib/wonderland/domain').WonderQuestionSort {
  return (WONDER_QUESTION_SORTS as readonly string[]).includes(value ?? '')
    ? value as import('@/lib/wonderland/domain').WonderQuestionSort
    : 'newest'
}

function readState(value?: string) {
  return value === 'open' || value === 'resolved' || value === 'closed' ? value : undefined
}

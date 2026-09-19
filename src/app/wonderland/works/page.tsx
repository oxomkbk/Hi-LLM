import { ArrowLeft, ChevronLeft, ChevronRight, Magnifier, PaperPlane } from '@gravity-ui/icons'
import Link from 'next/link'

import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import NavigationAiAssistant from '@/components/NavigationAiAssistant'
import SubmissionAction from '@/components/submission/submission-action'
import WonderlandWorkCard from '@/components/Wonderland/work-card'
import { getPaginationTokens } from '@/lib/pagination'
import { WONDER_WORK_KINDS, WONDER_WORK_SORTS } from '@/lib/wonderland/domain'
import { listPublicWorkPage } from '@/lib/wonderland/repositories/works'
import { WORK_KIND_LABELS } from '@/lib/wonderland/work-kinds'
import { buildWonderlandWorksPageHref } from '@/lib/wonderland/works-pagination'

import styles from './works.module.css'

import type { WonderWorkKind, WonderWorkSort } from '@/lib/wonderland/domain'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/wonderland/works' },
  description: '浏览社区成员发布的代码作品、开源项目、应用、插件与创作实验。',
  title: `作品广场・妙妙屋 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
}

export default async function WonderlandWorksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const q = first(query.q)?.slice(0, 80)
  const kind = readKind(first(query.kind))
  const sort = readSort(first(query.sort))
  const page = await listPublicWorkPage({ kind, limit: 12, page: readPage(first(query.page)), q, sort })
  const currentHref = workPageHref({ kind, page: page.page, q, sort })

  return (
    <div className="wonderland-full-bleed">
      <div className={`wonderland-page ${styles.page}`}>
        <header className={styles.masthead}>
          <div className="wonderland-content">
            <div className={styles.mastheadTopline}>
              <Link href="/wonderland" className={styles.quietAction}>
                <ArrowLeft aria-hidden="true" />
                妙妙屋
              </Link>
            </div>
            <div className={styles.mastheadInner}>
              <div>
                <h1>作品广场</h1>
                <p className={styles.mastheadLead}>应用、游戏、开源项目与创作实验。</p>
              </div>
              <div className={styles.mastheadAside}>
                <SubmissionAction channel="work" href="/wonderland/works/new" newWindow className={styles.primaryAction}>
                  <PaperPlane aria-hidden="true" />
                  发布作品
                </SubmissionAction>
              </div>
            </div>
          </div>
        </header>

        <main className="wonderland-content">
          <section aria-label="作品筛选" className={styles.discovery}>
            <div className={styles.discoverySearchRow}>
              <form action="/wonderland/works" className={styles.toolbar}>
                {kind ? <input name="kind" type="hidden" value={kind} /> : null}
                <label className={styles.search}>
                  <Magnifier aria-hidden="true" />
                  <span className="sr-only">搜索作品</span>
                  <input name="q" defaultValue={q} placeholder="搜索作品标题或内容" />
                </label>
                <select aria-label="作品排序" name="sort" defaultValue={sort}>
                  <option value="newest">最新发布</option>
                  <option value="popular">综合热度</option>
                  <option value="liked">最多喜欢</option>
                </select>
                <button type="submit">搜索</button>
              </form>
              <div className={styles.aiSearch}>
                <NavigationAiAssistant scope="works" />
              </div>
            </div>

            <nav aria-label="作品类型" className={styles.kindNav}>
              <Link href={workPageHref({ q, sort })} className={!kind ? styles.active : ''}>全部作品</Link>
              {WONDER_WORK_KINDS.map(item => (
                <Link key={item} href={workPageHref({ kind: item, q, sort })} className={kind === item ? styles.active : ''}>{WORK_KIND_LABELS[item]}</Link>
              ))}
            </nav>
          </section>

          <div className={styles.sectionHead}>
            <h2>{q || kind ? '搜索结果' : '最新作品'}</h2>
            <span>
              {page.total}
              {' '}
              个公开作品
            </span>
          </div>

          <ReturnTargetRestorer fallbackId="works-results" ready />

          <section aria-label="作品列表" id="works-results" className={styles.grid}>
            {page.list.map((work, index) => <WonderlandWorkCard key={work.id} priority={index === 0} returnTo={currentHref} work={work} />)}
            {!page.list.length
              ? (
                  <div className={styles.empty}>
                    <h3>暂时没有匹配的作品</h3>
                    <p>换个关键词，或者把你的第一个作品带到这里。</p>
                    <SubmissionAction channel="work" href="/wonderland/works/new">发布作品</SubmissionAction>
                  </div>
                )
              : null}
          </section>

          {page.totalPages > 1
            ? (
                <footer className="wonderland-pagination-bar">
                  <div className="wonderland-pagination-navigation">
                    <span className="wonderland-pagination-summary">
                      第
                      <strong>{page.page}</strong>
                      {' '}
                      /
                      {page.totalPages}
                      {' '}
                      页
                    </span>
                    <nav aria-label="作品广场分页" className="wonderland-pagination-pages">
                      {page.page > 1
                        ? (
                            <Link
                              href={buildWonderlandWorksPageHref({ kind, page: page.page - 1, q, sort })}
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
                        ? <span key={token.key} className="wonderland-pagination-ellipsis">…</span>
                        : <Link key={token.key} aria-current={token.value === page.page ? 'page' : undefined} href={buildWonderlandWorksPageHref({ kind, page: token.value, q, sort })} className="wonderland-pagination-number">{token.value}</Link>)}
                      {page.page < page.totalPages
                        ? (
                            <Link
                              href={buildWonderlandWorksPageHref({ kind, page: page.page + 1, q, sort })}
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
                  <form action="/wonderland/works" className="catalog-page-jump">
                    {q ? <input name="q" type="hidden" value={q} /> : null}
                    {kind ? <input name="kind" type="hidden" value={kind} /> : null}
                    {sort !== 'newest' ? <input name="sort" type="hidden" value={sort} /> : null}
                    <label htmlFor="work-page-jump">跳至</label>
                    <input
                      id="work-page-jump"
                      name="page"
                      type="number"
                      defaultValue={page.page}
                      max={page.totalPages}
                      min={1}
                    />
                    <span>
                      /
                      {page.totalPages}
                      {' '}
                      页
                    </span>
                    <button type="submit">跳转</button>
                  </form>
                </footer>
              )
            : null}
        </main>
      </div>
    </div>
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readKind(value?: string) {
  return WONDER_WORK_KINDS.includes(value as WonderWorkKind) ? value as WonderWorkKind : undefined
}

function readPage(value?: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function readSort(value?: string) {
  return WONDER_WORK_SORTS.includes(value as WonderWorkSort) ? value as WonderWorkSort : 'newest'
}
function workPageHref(input: { kind?: WonderWorkKind, page?: number, q?: string, sort?: WonderWorkSort }) {
  return buildWonderlandWorksPageHref(input).replace('#works-results', '')
}

import {
  ArrowLeft,
  Bookmark,
  Check,
  Comment,
  Eye,
  Persons,
} from '@gravity-ui/icons'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import CommentComposer from '@/components/Wonderland/comment-composer'
import CommentThread from '@/components/Wonderland/comment-thread'
import WonderlandContentRenderer from '@/components/Wonderland/content-renderer'
import ReportButton from '@/components/Wonderland/report-button'
import { buildContextualHref, safeReturnTo } from '@/lib/navigation/return-context'
import { formatDate, toIsoDateTime } from '@/lib/utils'
import { findPublicQuestionBySlug } from '@/lib/wonderland/repositories/community'

import { AnswerComposer } from './discussion-actions'
import { AnswerEngagement, QuestionEngagement, WonderlandEngagementProvider } from './engagement'

import type { Metadata } from 'next'

interface QuestionPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const QUESTION_RETURN_POLICY = {
  exactPathnames: ['/account', '/wonderland', '/wonderland/notifications'],
  pathnamePrefixes: ['/users'],
} as const

export async function generateMetadata({ params }: QuestionPageProps): Promise<Metadata> {
  const { slug } = await params
  const question = await findPublicQuestionBySlug(slug)
  return question
    ? {
        alternates: { canonical: `/wonderland/questions/${question.slug}` },
        description: question.summary,
        openGraph: { description: question.summary, title: question.title, type: 'article', url: `/wonderland/questions/${question.slug}` },
        title: `${question.title} ・ 妙妙屋`,
      }
    : { title: '问题不存在 ・ 妙妙屋' }
}

export default async function WonderlandQuestionPage({ params, searchParams }: QuestionPageProps) {
  const { slug } = await params
  const query = await searchParams
  const question = await findPublicQuestionBySlug(slug)
  if (!question)
    notFound()
  const backHref = safeReturnTo(query.returnTo, '/wonderland', QUESTION_RETURN_POLICY)
  const returnPath = buildContextualHref(`/wonderland/questions/${question.slug}`, backHref)

  return (
    <div className="wonderland-full-bleed">
      <div className="wonderland-page wonderland-detail-page">
        <div className="wonderland-content py-7 sm:py-10">
          <Link href={backHref} className="wonderland-back-link">
            <ArrowLeft />
            返回问题广场
          </Link>
          <WonderlandEngagementProvider questionId={question.id}>
            <div className="wonderland-detail-layout">
              <main>
                <article className="wonderland-question-detail">
                  <header>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="wonderland-category-label">{question.category.name}</span>
                      {question.accepted_answer_id
                        ? (
                            <span className="wonderland-state is-resolved">
                              <Check />
                              已解决
                            </span>
                          )
                        : null}
                    </div>
                    <h1>{question.title}</h1>
                    <p className="wonderland-question-summary">{question.summary}</p>
                    <div className="wonderland-detail-meta">
                      <span>
                        <Link href={`/users/${question.author.id}`}>{question.author.name}</Link>
                        {' '}
                        提问
                      </span>
                      <ReportButton returnPath={returnPath} targetId={question.id} targetType="question" />
                      <time dateTime={toIsoDateTime(question.created_at)}>{formatDate(question.created_at, 'datetime')}</time>
                      <span>
                        <Eye />
                        {question.view_count}
                        {' '}
                        浏览
                      </span>
                    </div>
                  </header>
                  <div className="wonderland-post-shell">
                    <QuestionEngagement
                      favoriteCount={question.favorite_count}
                      followerCount={question.follower_count}
                      questionId={question.id}
                      voteScore={question.vote_score}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="wonderland-post-label">问题正文</p>
                      <WonderlandContentRenderer document={question.content_json} />
                      <div className="wonderland-post-tags">
                        {question.tags.map(tag => (
                          <span key={tag.id}>
                            #
                            {tag.name}
                          </span>
                        ))}
                      </div>
                      <CommentThread comments={question.comments} heading="问题下的评论" returnPath={returnPath} target={{ questionId: question.id, type: 'question' }} />
                      <CommentComposer target={{ questionId: question.id, type: 'question' }} />
                    </div>
                  </div>
                </article>

                <section className="wonderland-answers">
                  <div className="wonderland-section-head">
                    <div>
                      <p className="wonderland-kicker">ANSWERS</p>
                      <h2>
                        {question.answer_count}
                        {' '}
                        个回答
                      </h2>
                    </div>
                    <span>按采纳与得票排序</span>
                  </div>
                  {question.answers.map(answer => (
                    <article key={answer.id} className={`wonderland-answer ${answer.is_accepted ? 'is-accepted' : ''}`}>
                      {answer.is_accepted
                        ? (
                            <div className="wonderland-accepted-banner">
                              <Check />
                              提问者已采纳这个回答
                            </div>
                          )
                        : null}
                      <div className="wonderland-post-shell">
                        <AnswerEngagement
                          isAccepted={answer.is_accepted}
                          answerAuthorId={answer.author.id}
                          answerId={answer.id}
                          questionAuthorId={question.author.id}
                          questionId={question.id}
                          voteScore={answer.vote_score}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="wonderland-post-label">回答内容</p>
                          <WonderlandContentRenderer document={answer.content_json} />
                          <div className="wonderland-answer-author">
                            <span className="wonderland-author-mark">{answer.author.name.slice(0, 1).toUpperCase()}</span>
                            <div>
                              <strong><Link href={`/users/${answer.author.id}`}>{answer.author.name}</Link></strong>
                              <time dateTime={toIsoDateTime(answer.created_at)}>
                                {formatDate(answer.created_at, 'datetime')}
                                {' '}
                                回答
                              </time>
                            </div>
                            <ReportButton returnPath={returnPath} targetId={answer.id} targetType="answer" />
                          </div>
                          <CommentThread comments={answer.comments} heading="回答下的评论" returnPath={returnPath} target={{ answerId: answer.id, questionId: question.id, type: 'answer' }} />
                          <CommentComposer target={{ answerId: answer.id, questionId: question.id, type: 'answer' }} />
                        </div>
                      </div>
                    </article>
                  ))}
                </section>

                <AnswerComposer disabled={question.is_closed || question.is_locked} questionId={question.id} returnPath={returnPath} />
              </main>
              <aside className="wonderland-detail-sidebar">
                <section>
                  <p className="wonderland-kicker">DISCUSSION DATA</p>
                  <div className="wonderland-detail-stats">
                    <div>
                      <strong>{question.answer_count}</strong>
                      <span>
                        <Comment />
                        回答
                      </span>
                    </div>
                    <div>
                      <strong>{question.follower_count}</strong>
                      <span>
                        <Persons />
                        关注
                      </span>
                    </div>
                    <div>
                      <strong>{question.favorite_count}</strong>
                      <span>
                        <Bookmark />
                        收藏
                      </span>
                    </div>
                    <div>
                      <strong>{question.view_count}</strong>
                      <span>
                        <Eye />
                        浏览
                      </span>
                    </div>
                  </div>
                </section>
                <section>
                  <p className="wonderland-kicker">ASKED BY</p>
                  <div className="wonderland-question-author">
                    <span>{question.author.name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong><Link href={`/users/${question.author.id}`}>{question.author.name}</Link></strong>
                      <small>社区贡献者</small>
                    </div>
                  </div>
                </section>
                <section className="wonderland-detail-note">
                  <strong>回答之前</strong>
                  <p>请确保你在回答原问题，并用可复现的事实支撑结论。</p>
                </section>
              </aside>
            </div>
          </WonderlandEngagementProvider>
        </div>
      </div>
    </div>
  )
}

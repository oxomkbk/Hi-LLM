import { Check, Comment, Eye } from '@gravity-ui/icons'
import Link from 'next/link'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { questionDisplayState } from '@/lib/wonderland/domain'

import type { WonderQuestionListItem } from '@/lib/wonderland/domain'

export default function WonderlandQuestionCard({ question, returnTo }: { question: WonderQuestionListItem, returnTo: string }) {
  const state = questionDisplayState(question)
  const targetId = returnTargetId('wonderland-question', question.id)
  return (
    <article id={targetId} tabIndex={-1} className="wonderland-question-card">
      <div className="min-w-0 flex-1">
        <div className="wonderland-question-eyebrow">
          <span className="wonderland-category-label">{question.category.name}</span>
          {state === 'resolved'
            ? (
                <span className="wonderland-state is-resolved">
                  <Check className="size-3" />
                  已解决
                </span>
              )
            : null}
          {state === 'closed' ? <span className="wonderland-state">已关闭</span> : null}
        </div>
        <h2>
          <ConfigurableDetailLink
            contextualHref={buildContextualHref(`/wonderland/questions/${question.slug}`, returnTo, targetId)}
            href={`/wonderland/questions/${question.slug}`}
          >
            {question.title}
          </ConfigurableDetailLink>
        </h2>
        <p>{question.summary}</p>
        <div className="wonderland-question-footer">
          <div className="flex flex-wrap gap-1.5">
            {question.tags.slice(0, 3).map(tag => (
              <span key={tag.id} className="wonderland-tag">
                #
                {tag.name}
              </span>
            ))}
          </div>
          <div className="wonderland-question-byline">
            <Link href={`/users/${question.author.id}`}>{question.author.name}</Link>
            <time dateTime={new Date(question.last_activity_at).toISOString()}>{relativeTime(question.last_activity_at)}</time>
            <span>
              <Eye className="size-3.5" />
              {question.view_count}
            </span>
            <span>
              <Comment className="size-3.5" />
              {question.comment_count}
            </span>
          </div>
        </div>
      </div>
      <dl aria-label="问题数据" className="wonderland-question-metrics">
        <div>
          <dt>回答</dt>
          <dd className={state === 'resolved' ? 'is-resolved' : ''}>{question.answer_count}</dd>
        </div>
        <div>
          <dt>投票</dt>
          <dd>{question.vote_score}</dd>
        </div>
      </dl>
    </article>
  )
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60)
    return '刚刚'
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 86400 * 30)
    return `${Math.floor(seconds / 86400)} 天前`
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

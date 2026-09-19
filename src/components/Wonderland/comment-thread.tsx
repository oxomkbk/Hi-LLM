import Link from 'next/link'

import MarkdownRenderer from '@/components/content/markdown-renderer'
import { formatDate, toIsoDateTime } from '@/lib/utils'

import CommentComposer from './comment-composer'
import ReportButton from './report-button'

import type { CommentTarget } from './comment-composer'
import type { WonderComment } from '@/lib/wonderland/domain'

export default function CommentThread({ comments, heading, returnPath, target }: {
  comments: WonderComment[]
  heading?: string
  returnPath: string
  target: CommentTarget
}) {
  if (!comments.length)
    return null
  return (
    <div className="wonderland-comments">
      {heading
        ? (
            <div className="wonderland-comments-heading">
              <span>{heading}</span>
              <small>
                {comments.length}
                {' '}
                条
              </small>
            </div>
          )
        : null}
      {comments.map(comment => (
        <article key={comment.id} className="wonderland-comment">
          <header className="wonderland-comment-author">
            <span aria-hidden="true">{comment.author.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <Link href={`/users/${comment.author.id}`}>{comment.author.name}</Link>
              <time dateTime={toIsoDateTime(comment.created_at)}>{formatDate(comment.created_at, 'datetime')}</time>
            </div>
            <ReportButton returnPath={returnPath} targetId={comment.id} targetType="comment" />
          </header>
          <MarkdownRenderer content={comment.body} className="wonderland-comment-markdown" />
          {comment.replies.length
            ? (
                <div className="wonderland-comment-replies">
                  {comment.replies.map(reply => (
                    <article key={reply.id} className="wonderland-comment-reply">
                      <header className="wonderland-comment-author">
                        <span aria-hidden="true">{reply.author.name.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <Link href={`/users/${reply.author.id}`}>{reply.author.name}</Link>
                          <time dateTime={toIsoDateTime(reply.created_at)}>{formatDate(reply.created_at, 'datetime')}</time>
                        </div>
                        <ReportButton returnPath={returnPath} targetId={reply.id} targetType="comment" />
                      </header>
                      <MarkdownRenderer content={reply.body} className="wonderland-comment-markdown" />
                    </article>
                  ))}
                </div>
              )
            : null}
          <CommentComposer label="回复" parentId={comment.id} target={target} />
        </article>
      ))}
    </div>
  )
}

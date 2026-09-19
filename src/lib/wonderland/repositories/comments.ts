import 'server-only'

import { queryBusiness } from '../../db/business'

import type { WonderComment } from '../domain'

const PUBLIC_AUTHOR_SQL = `jsonb_build_object(
  'id', author.id,
  'name', coalesce(nullif(author.display_name, ''), '社区用户'),
  'image', author.avatar_url
)`

export async function listPublicWonderComments(input: {
  newsId?: string
  questionId?: string
  rootLimit?: number
}) {
  if (Boolean(input.newsId) === Boolean(input.questionId))
    return []
  const column = input.newsId ? 'news_id' : 'question_id'
  const targetId = input.newsId ?? input.questionId!
  const rootLimit = Math.min(100, Math.max(1, input.rootLimit ?? 60))
  const result = await queryBusiness<Omit<WonderComment, 'replies'>>(`
    with roots as (
      select id
      from public.wonder_comments
      where ${column} = $1::uuid and parent_id is null and visibility = 'visible'
      order by created_at, id
      limit $2
    )
    select comment.id, comment.question_id, comment.answer_id, comment.news_id,
           comment.parent_id, comment.body, comment.edited_at, comment.created_at,
           ${PUBLIC_AUTHOR_SQL} as author
    from public.wonder_comments comment
    join public.app_users author on author.id = comment.author_id
    where comment.visibility = 'visible'
      and (comment.id in (select id from roots) or comment.parent_id in (select id from roots))
    order by comment.created_at, comment.id
  `, [targetId, rootLimit])
  return nestWonderComments(result.rows)
}

export function nestWonderComments(rows: Array<Omit<WonderComment, 'replies'>>): WonderComment[] {
  const byId = new Map<string, WonderComment>()
  for (const row of rows)
    byId.set(row.id, { ...row, replies: [] })
  const roots: WonderComment[] = []
  for (const comment of byId.values()) {
    if (comment.parent_id && byId.has(comment.parent_id))
      byId.get(comment.parent_id)!.replies.push(comment)
    else
      roots.push(comment)
  }
  return roots
}

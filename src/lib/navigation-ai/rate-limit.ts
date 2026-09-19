import 'server-only'

import { withControlTransaction } from '@/lib/db/control'

export class NavigationAiDuplicateRequestError extends Error {
  readonly code = 'NAVIGATION_AI_DUPLICATE_REQUEST'
  readonly status = 409

  constructor(message = '这次搜索正在处理中，请稍候') {
    super(message)
  }
}

export class NavigationAiRateLimitError extends Error {
  readonly code = 'NAVIGATION_AI_RATE_LIMITED'
  readonly status = 429
}

export async function reserveNavigationAiRequest(visitorHash: string, requestFingerprint: string) {
  await withControlTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', ['navigation-ai:global'])
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`navigation-ai:${visitorHash}`])

    const counts = await client.query<{
      global_count: string
      duplicate_count: string
      visitor_day_count: string
      visitor_window_count: string
    }>(`
      select
        count(*) filter (
          where bucket_type = 'visitor' and bucket_key = $1
            and request_fingerprint = $2
            and created_at >= now() - interval '20 seconds'
        )::text as duplicate_count,
        count(*) filter (
          where bucket_type = 'global' and created_at >= now() - interval '1 hour'
        )::text as global_count,
        count(*) filter (
          where bucket_type = 'visitor' and bucket_key = $1
            and created_at >= now() - interval '24 hours'
        )::text as visitor_day_count,
        count(*) filter (
          where bucket_type = 'visitor' and bucket_key = $1
            and created_at >= now() - interval '10 minutes'
        )::text as visitor_window_count
      from control.navigation_ai_request_events
      where created_at >= now() - interval '24 hours'
    `, [visitorHash, requestFingerprint])
    const current = counts.rows[0]
    if (Number(current?.duplicate_count ?? 0) > 0)
      throw new NavigationAiDuplicateRequestError()
    if (Number(current?.visitor_window_count ?? 0) >= 12)
      throw new NavigationAiRateLimitError('搜索有点频繁，请十分钟后再试')
    if (Number(current?.visitor_day_count ?? 0) >= 50)
      throw new NavigationAiRateLimitError('今天的 AI 搜索次数已用完，请明天再来')
    if (Number(current?.global_count ?? 0) >= 300)
      throw new NavigationAiRateLimitError('AI 搜索正在排队，请稍后再试')

    await client.query(`
      insert into control.navigation_ai_request_events (bucket_type, bucket_key, request_fingerprint)
      values ('global', 'all', null), ('visitor', $1, $2)
    `, [visitorHash, requestFingerprint])
    await client.query(`
      delete from control.navigation_ai_request_events
      where created_at < now() - interval '2 days'
    `)
  })
}

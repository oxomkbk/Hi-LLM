import 'server-only'

import { withControlTransaction } from '@/lib/db/control'

export class WebsiteExtractionRateLimitError extends Error {
  readonly status = 429
}

export async function reserveWebsiteExtraction(visitorHash: string) {
  await withControlTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`website-extract:${visitorHash}`])
    const counts = await client.query<{ global_count: string, visitor_count: string }>(`
      select
        count(*) filter (
          where bucket_type = 'global' and created_at >= now() - interval '1 hour'
        )::text as global_count,
        count(*) filter (
          where bucket_type = 'visitor' and bucket_key = $1
            and created_at >= now() - interval '24 hours'
        )::text as visitor_count
      from control.website_extraction_events
      where created_at >= now() - interval '24 hours'
    `, [visitorHash])
    const current = counts.rows[0]
    if (Number(current?.visitor_count ?? 0) >= 3)
      throw new WebsiteExtractionRateLimitError('24 小时内最多提取 3 个网站')
    if (Number(current?.global_count ?? 0) >= 60)
      throw new WebsiteExtractionRateLimitError('网站提取请求较多，请稍后再试')

    await client.query(`
      insert into control.website_extraction_events (bucket_type, bucket_key)
      values ('global', 'all'), ('visitor', $1)
    `, [visitorHash])
    await client.query(`
      delete from control.website_extraction_events
      where created_at < now() - interval '2 days'
    `)
  })
}

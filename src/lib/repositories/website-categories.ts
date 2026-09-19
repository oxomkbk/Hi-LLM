import 'server-only'

import type { PoolClient } from 'pg'

export async function replaceWebsiteCategories(client: PoolClient, websiteId: string, categoryIds: string[]) {
  await client.query(`delete from public.ds_website_categories where website_id = $1::uuid`, [websiteId])
  await client.query(`
    insert into public.ds_website_categories (website_id, category_id, position)
    select $1::uuid, category_id, (position - 1)::smallint
    from unnest($2::uuid[]) with ordinality as selected(category_id, position)
  `, [websiteId, categoryIds])
}

export async function replaceWebsiteSubmissionCategories(
  client: PoolClient,
  submissionId: string,
  categoryIds: string[],
) {
  await client.query(`
    delete from public.ds_website_submission_categories
    where submission_id = $1::uuid
  `, [submissionId])
  await client.query(`
    insert into public.ds_website_submission_categories (submission_id, category_id, position)
    select $1::uuid, category_id, (position - 1)::smallint
    from unnest($2::uuid[]) with ordinality as selected(category_id, position)
  `, [submissionId, categoryIds])
}

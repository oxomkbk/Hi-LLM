import 'server-only'

import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'
import { parseFileToken } from '@/lib/files/service'
import {
  replaceWebsiteCategories,
  replaceWebsiteSubmissionCategories,
} from '@/lib/repositories/website-categories'

import type { Actor, PageResult } from './catalog'
import type { SanitizedWebsiteInput } from '@/lib/security'
import type { WebsiteSubmission, WebsiteSubmissionStatus } from '@/types'

interface SubmissionInput extends SanitizedWebsiteInput {
  id: string
  logo: string
  submittedIpHash: string
}

const SUBMISSION_CATEGORY_COLUMNS = `
  coalesce(category_membership.category_ids, array[submission.category_id]) as category_ids,
  coalesce(
    category_membership.categories,
    jsonb_build_array(jsonb_build_object('id', category.id, 'name', category.name))
  ) as categories
`

const SUBMISSION_CATEGORY_JOIN = `
  left join lateral (
    select
      array_agg(link.category_id order by link.position) as category_ids,
      jsonb_agg(
        jsonb_build_object('id', linked_category.id, 'name', linked_category.name)
        order by link.position
      ) as categories
    from public.ds_website_submission_categories link
    join public.ds_categorys linked_category on linked_category.id = link.category_id
    where link.submission_id = submission.id
  ) category_membership on true
`

export class SubmissionConflictError extends Error {
  readonly status = 409
}

export class SubmissionRateLimitError extends Error {
  readonly status = 429
}

export class WebsiteSubmissionRepository {
  async list(input: {
    limit: number
    name?: string
    offset: number
    status?: WebsiteSubmissionStatus
  }): Promise<PageResult<WebsiteSubmission>> {
    const filters: string[] = []
    const values: unknown[] = []
    if (input.status) {
      values.push(input.status)
      filters.push(`submission.status = $${values.length}`)
    }
    if (input.name) {
      values.push(`%${input.name}%`)
      filters.push(`submission.name ilike $${values.length}`)
    }
    const where = filters.length ? `where ${filters.join(' and ')}` : ''
    const count = await queryBusiness<{ total: string }>(`
      select count(*)::text as total
      from public.ds_website_submissions submission ${where}
    `, values)
    values.push(input.limit, input.offset)
    const result = await queryBusiness<WebsiteSubmission>(`
      select submission.*, json_build_object('id', category.id, 'name', category.name) as category,
             ${SUBMISSION_CATEGORY_COLUMNS}
      from public.ds_website_submissions submission
      join public.ds_categorys category on category.id = submission.category_id
      ${SUBMISSION_CATEGORY_JOIN}
      ${where}
      order by submission.created_at desc
      limit $${values.length - 1} offset $${values.length}
    `, values)
    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async preflight(input: { categoryIds: string[], submittedIpHash: string, url: string }) {
    const result = await queryBusiness<{
      category_exists: boolean
      published_exists: boolean
      pending_exists: boolean
      recent_count: string
    }>(`
      select
        (select count(*) from public.ds_categorys where id = any($1::uuid[])) = cardinality($1::uuid[])
          as category_exists,
        exists(select 1 from public.ds_websites where url = $2) as published_exists,
        exists(select 1 from public.ds_website_submissions where url = $2 and status = 'pending') as pending_exists,
        (select count(*)::text from public.ds_website_submissions
         where submitted_ip_hash = $3 and created_at >= now() - interval '24 hours') as recent_count
    `, [input.categoryIds, input.url, input.submittedIpHash])
    assertSubmissionAllowed(result.rows[0]!)
  }

  async create(input: SubmissionInput) {
    return withBusinessTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`website-submit:${input.submittedIpHash}`])
      const checks = await client.query<{
        category_exists: boolean
        published_exists: boolean
        pending_exists: boolean
        recent_count: string
      }>(`
        select
          (select count(*) from public.ds_categorys where id = any($1::uuid[])) = cardinality($1::uuid[])
            as category_exists,
          exists(select 1 from public.ds_websites where url = $2) as published_exists,
          exists(select 1 from public.ds_website_submissions where url = $2 and status = 'pending') as pending_exists,
          (select count(*)::text from public.ds_website_submissions
           where submitted_ip_hash = $3 and created_at >= now() - interval '24 hours') as recent_count
      `, [input.category_ids, input.url, input.submittedIpHash])
      assertSubmissionAllowed(checks.rows[0]!)

      const result = await client.query<Pick<WebsiteSubmission, 'created_at' | 'id' | 'status'>>(`
        insert into public.ds_website_submissions (
          id, category_id, name, url, logo, tags, "desc", pinned, recommend,
          vpn, "commonlyUsed", sort, submitted_ip_hash
        ) values (
          $1::uuid, $2::uuid, $3, $4, $5, $6::text[], $7, $8, $9,
          $10, $11, $12, $13
        )
        returning id, status, created_at
      `, [
        input.id,
        input.category_id,
        input.name,
        input.url,
        input.logo,
        input.tags,
        input.desc || null,
        input.pinned,
        input.recommend,
        input.vpn,
        input.commonlyUsed,
        input.sort,
        input.submittedIpHash,
      ])
      await replaceWebsiteSubmissionCategories(client, input.id, input.category_ids)
      return result.rows[0]!
    })
  }

  async update(id: string, input: SanitizedWebsiteInput) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<Pick<WebsiteSubmission, 'id' | 'status' | 'updated_at'>>(`
        update public.ds_website_submissions set
          category_id = $2::uuid, name = $3, url = $4, tags = $5::text[],
          "desc" = $6, pinned = $7, recommend = $8, vpn = $9,
          "commonlyUsed" = $10, sort = $11
        where id = $1::uuid and status <> 'approved'
        returning id, status, updated_at
      `, [
        id,
        input.category_id,
        input.name,
        input.url,
        input.tags,
        input.desc || null,
        input.pinned,
        input.recommend,
        input.vpn,
        input.commonlyUsed,
        input.sort,
      ])
      if (!result.rowCount)
        return null
      await replaceWebsiteSubmissionCategories(client, id, input.category_ids)
      return result.rows[0]!
    })
  }

  async approve(id: string, actor: Actor) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const current = await client.query<WebsiteSubmission>(`
        select submission.*,
               coalesce(
                 (
                   select array_agg(link.category_id order by link.position)
                   from public.ds_website_submission_categories link
                   where link.submission_id = submission.id
                 ),
                 array[submission.category_id]
               ) as category_ids
        from public.ds_website_submissions submission
        where id = $1::uuid for update
      `, [id])
      const submission = current.rows[0]
      if (!submission)
        throw new SubmissionConflictError('投稿不存在')
      if (submission.status === 'approved')
        throw new SubmissionConflictError('该投稿已经审核通过')

      const logoFileId = parseFileToken(submission.logo)
      const website = await client.query<{ id: string }>(`
        insert into public.ds_websites (
          user_id, emial, category_id, name, url, logo, logo_file_id, tags,
          "desc", pinned, recommend, vpn, "commonlyUsed", sort
        ) values (
          $1::uuid, $2, $3::uuid, $4, $5, $6, $7::uuid, $8::text[],
          $9, $10, $11, $12, $13, $14
        ) returning id
      `, [
        actor.id,
        actor.email,
        submission.category_id,
        submission.name,
        submission.url,
        submission.logo,
        logoFileId,
        submission.tags,
        submission.desc,
        submission.pinned,
        submission.recommend,
        submission.vpn,
        submission.commonlyUsed,
        submission.sort,
      ])
      await replaceWebsiteCategories(client, website.rows[0]!.id, submission.category_ids)
      await client.query(`
        update public.ds_website_submissions
        set status = 'approved', reviewer_id = $2::uuid, reviewed_at = now(), review_note = null
        where id = $1::uuid
      `, [id, actor.id])
      if (logoFileId) {
        await client.query(`
          update public.file_objects set visibility = 'public'
          where id = $1::uuid and status = 'ready'
        `, [logoFileId])
      }
      return { id, status: 'approved' as const, website_id: website.rows[0]!.id }
    })
  }

  async reject(id: string, actor: Actor, note: string) {
    await ensureBusinessUser(actor)
    const result = await queryBusiness<Pick<WebsiteSubmission, 'id' | 'review_note' | 'reviewed_at' | 'status'>>(`
      update public.ds_website_submissions
      set status = 'rejected', review_note = $2, reviewer_id = $3::uuid, reviewed_at = now()
      where id = $1::uuid and status <> 'approved'
      returning id, status, review_note, reviewed_at
    `, [id, note || null, actor.id])
    return result.rows[0] ?? null
  }
}

function assertSubmissionAllowed(input: {
  category_exists: boolean
  pending_exists: boolean
  published_exists: boolean
  recent_count: string
}) {
  if (Number(input.recent_count) >= 3)
    throw new SubmissionRateLimitError('24 小时内最多提交 3 个网站')
  if (!input.category_exists)
    throw new Error('所选分类不存在')
  if (input.pending_exists)
    throw new SubmissionConflictError('该网站已在审核队列中')
  if (input.published_exists)
    throw new SubmissionConflictError('该网站已收录，无需重复提交')
}

export const websiteSubmissionRepository = new WebsiteSubmissionRepository()

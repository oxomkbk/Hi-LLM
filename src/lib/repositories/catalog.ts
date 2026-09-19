import 'server-only'

import { ensureBusinessUser, getBusinessPool, queryBusiness, withBusinessTransaction } from '@/lib/db/business'
import { decorateRankingWebsites, RANKING_PERIOD_LABELS } from '@/lib/rankings'
import { replaceWebsiteCategories } from '@/lib/repositories/website-categories'

import type {
  Category,
  CategorySaveParams,
  PublicCatalogCategory,
  RankingCategory,
  RankingData,
  RankingPeriod,
  Website,
  WebsiteSaveParams,
} from '@/types'
import type { Pool, PoolClient } from 'pg'

const WEBSITE_CATEGORY_COLUMNS = `
  coalesce(category_membership.category_ids, array[website.category_id]) as category_ids,
  coalesce(
    category_membership.categories,
    jsonb_build_array(jsonb_build_object('id', category.id, 'name', category.name))
  ) as categories
`

const WEBSITE_CATEGORY_JOIN = `
  left join lateral (
    select
      array_agg(link.category_id order by link.position) as category_ids,
      jsonb_agg(
        jsonb_build_object('id', linked_category.id, 'name', linked_category.name)
        order by link.position
      ) as categories
    from public.ds_website_categories link
    join public.ds_categorys linked_category on linked_category.id = link.category_id
    where link.website_id = website.id
  ) category_membership on true
`

const WEBSITE_RANKING_JOIN = `
  left join (
    select id, "rankingPosition"
    from (
      select
        id,
        row_number() over (order by "visitCount" desc, created_at, id)::int as "rankingPosition"
      from public.ds_websites
    ) ranked_website
    where "rankingPosition" <= 3
  ) website_ranking on website_ranking.id = website.id
`

// Editorial states must lead each category. Manual sort then controls the
// order inside the pinned/recommended/regular groups.
const WEBSITE_DIRECTORY_ORDER_SQL = `
  website.pinned desc,
  website.recommend desc,
  website.sort desc,
  website.created_at desc
`

const RANKING_DAY_START_SQL = `(date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')`

const RANKING_WINDOW_SQL: Record<Exclude<RankingPeriod, 'all'>, {
  currentCondition: string
  previousCondition: string
  scanCondition: string
}> = {
  day: {
    currentCondition: `event.created_at >= ${RANKING_DAY_START_SQL}`,
    previousCondition: `event.created_at >= ${RANKING_DAY_START_SQL} - interval '1 day'
      and event.created_at < now() - interval '1 day'`,
    scanCondition: `event.created_at >= ${RANKING_DAY_START_SQL} - interval '1 day'`,
  },
  month: {
    currentCondition: `event.created_at >= now() - interval '30 days'`,
    previousCondition: `event.created_at >= now() - interval '60 days'
      and event.created_at < now() - interval '30 days'`,
    scanCondition: `event.created_at >= now() - interval '60 days'`,
  },
  week: {
    currentCondition: `event.created_at >= now() - interval '7 days'`,
    previousCondition: `event.created_at >= now() - interval '14 days'
      and event.created_at < now() - interval '7 days'`,
    scanCondition: `event.created_at >= now() - interval '14 days'`,
  },
}

export interface Actor {
  email: string
  id: string
  image?: string | null
  name?: string | null
}

export interface PageResult<T> {
  list: T[]
  total: number
}

interface RankingQueryRow {
  categories: RankingCategory[]
  currentVisits: string
  desc: string | null
  id: string
  logo: string | null
  name: string
  previousRank: number | null
  previousVisits: string | null
  rank: number
  tags: string[]
  url: string
  visitCount: number
  vpn: boolean
}

export class CatalogRepository {
  async listPublicCatalog(): Promise<PublicCatalogCategory[]> {
    const categories = await queryBusiness<{ id: string, name: string }>(`
      select id, name
      from public.ds_categorys
      order by sort desc, created_at desc
    `)
    if (!categories.rowCount)
      return []

    const ids = categories.rows.map(category => category.id)
    const categoryIdSet = new Set(ids)
    const websites = await queryBusiness<Website>(`
      select
        website.id, website.name, website.url, website.logo, website.tags,
        website."desc", website.vpn, website.pinned, website.recommend,
        website."commonlyUsed", website.sort, website.created_at,
        website_ranking."rankingPosition",
        ${WEBSITE_CATEGORY_COLUMNS}
      from public.ds_websites website
      join public.ds_categorys category on category.id = website.category_id
      ${WEBSITE_CATEGORY_JOIN}
      ${WEBSITE_RANKING_JOIN}
      where coalesce(category_membership.category_ids, array[website.category_id]) && $1::uuid[]
      order by ${WEBSITE_DIRECTORY_ORDER_SQL}
    `, [ids])

    const grouped = new Map<string, Website[]>()
    for (const website of websites.rows) {
      for (const categoryId of website.category_ids) {
        if (!categoryIdSet.has(categoryId))
          continue
        const group = grouped.get(categoryId) ?? []
        group.push(website)
        grouped.set(categoryId, group)
      }
    }

    return categories.rows.map(category => ({
      id: category.id,
      name: category.name,
      websites: grouped.get(category.id) ?? [],
    }))
  }

  async listCategories(input: { limit: number, name?: string, offset: number }): Promise<PageResult<Category>> {
    const filters: string[] = []
    const values: unknown[] = []
    if (input.name) {
      values.push(`%${input.name}%`)
      filters.push(`name ilike $${values.length}`)
    }
    const where = filters.length ? `where ${filters.join(' and ')}` : ''
    const count = await queryBusiness<{ total: string }>(
      `select count(*)::text as total from public.ds_categorys ${where}`,
      values,
    )
    values.push(input.limit, input.offset)
    const categories = await queryBusiness<Omit<Category, 'websites'>>(`
      select * from public.ds_categorys
      ${where}
      order by sort desc, created_at desc
      limit $${values.length - 1} offset $${values.length}
    `, values)

    const ids = categories.rows.map(category => category.id)
    const categoryIdSet = new Set(ids)
    const websites = ids.length
      ? await queryBusiness<Website>(`
          select website.*, row_to_json(category.*) as category,
                 website_ranking."rankingPosition",
                 ${WEBSITE_CATEGORY_COLUMNS}
          from public.ds_websites website
          join public.ds_categorys category on category.id = website.category_id
          ${WEBSITE_CATEGORY_JOIN}
          ${WEBSITE_RANKING_JOIN}
          where coalesce(category_membership.category_ids, array[website.category_id]) && $1::uuid[]
          order by ${WEBSITE_DIRECTORY_ORDER_SQL}
        `, [ids])
      : { rows: [] as Website[] }
    const grouped = new Map<string, Website[]>()
    for (const website of websites.rows) {
      for (const categoryId of website.category_ids) {
        if (!categoryIdSet.has(categoryId))
          continue
        const group = grouped.get(categoryId) ?? []
        group.push(website)
        grouped.set(categoryId, group)
      }
    }

    return {
      list: categories.rows.map(category => ({ ...category, websites: grouped.get(category.id) ?? [] })) as Category[],
      total: Number(count.rows[0]?.total ?? 0),
    }
  }

  async listCategoryOptions() {
    const result = await queryBusiness<Pick<Category, 'id' | 'name'>>(`
      select id, name from public.ds_categorys order by sort desc, created_at desc
    `)
    return result.rows
  }

  async createCategory(input: CategorySaveParams, actor: Actor) {
    await ensureBusinessUser(actor)
    const result = await queryBusiness<Category>(`
      insert into public.ds_categorys (user_id, emial, name, sort)
      values ($1::uuid, $2, $3, $4)
      returning *
    `, [actor.id, actor.email, input.name.trim(), input.sort])
    return result.rows[0]!
  }

  async updateCategory(id: string, input: CategorySaveParams) {
    const result = await queryBusiness<Category>(`
      update public.ds_categorys set name = $2, sort = $3
      where id = $1::uuid returning *
    `, [id, input.name.trim(), input.sort])
    return result.rows[0] ?? null
  }

  async deleteCategory(id: string) {
    const result = await queryBusiness<Category>(`
      delete from public.ds_categorys where id = $1::uuid returning *
    `, [id])
    return result.rows[0] ?? null
  }

  async listWebsites(input: { categoryId?: string, limit: number, name?: string, offset: number }): Promise<PageResult<Website>> {
    const filters: string[] = []
    const values: unknown[] = []
    if (input.name) {
      values.push(`%${input.name}%`)
      filters.push(`website.name ilike $${values.length}`)
    }
    if (input.categoryId) {
      values.push(input.categoryId)
      filters.push(`exists (
        select 1 from public.ds_website_categories filter_category
        where filter_category.website_id = website.id
          and filter_category.category_id = $${values.length}::uuid
      )`)
    }
    const where = filters.length ? `where ${filters.join(' and ')}` : ''
    const count = await queryBusiness<{ total: string }>(`
      select count(*)::text as total from public.ds_websites website ${where}
    `, values)
    values.push(input.limit, input.offset)
    const result = await queryBusiness<Website>(`
      select website.*, row_to_json(category.*) as category,
             ${WEBSITE_CATEGORY_COLUMNS}
      from public.ds_websites website
      join public.ds_categorys category on category.id = website.category_id
      ${WEBSITE_CATEGORY_JOIN}
      ${where}
      order by ${WEBSITE_DIRECTORY_ORDER_SQL}
      limit $${values.length - 1} offset $${values.length}
    `, values)

    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async createWebsite(input: WebsiteSaveParams, actor: Actor) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const result = await client.query<{ id: string }>(`
        insert into public.ds_websites (
          user_id, emial, category_id, name, url, logo, tags, "desc",
          pinned, recommend, vpn, "commonlyUsed", sort
        ) values (
          $1::uuid, $2, $3::uuid, $4, $5, $6, $7::text[], $8,
          $9, $10, $11, $12, $13
        ) returning id
      `, [
        actor.id,
        actor.email,
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
      ])
      const id = result.rows[0]!.id
      await replaceWebsiteCategories(client, id, input.category_ids)
      return findWebsite(client, id)
    })
  }

  async updateWebsite(id: string, input: WebsiteSaveParams) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<{ id: string }>(`
        update public.ds_websites set
          category_id = $2::uuid, name = $3, url = $4, tags = $5::text[],
          "desc" = $6, pinned = $7, recommend = $8, vpn = $9,
          "commonlyUsed" = $10, sort = $11
        where id = $1::uuid returning id
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
      await replaceWebsiteCategories(client, id, input.category_ids)
      return findWebsite(client, id)
    })
  }

  async deleteWebsite(id: string) {
    const result = await queryBusiness<Website & { logo_file_id: string | null }>(`
      delete from public.ds_websites where id = $1::uuid returning *
    `, [id])
    return result.rows[0] ?? null
  }

  async findWebsiteById(id: string) {
    const pool = await getBusinessPool()
    return findWebsite(pool, id)
  }

  async updateWebsiteLogo(id: string, logo: string | null, logoFileId: string | null = null) {
    const result = await queryBusiness<Website>(`
      update public.ds_websites
      set logo = $2, logo_file_id = $3::uuid
      where id = $1::uuid
      returning *
    `, [id, logo, logoFileId])
    return result.rows[0] ?? null
  }

  async rankings(input: { categoryId?: string, limit?: number, period: RankingPeriod }): Promise<RankingData> {
    const limit = input.limit ?? 30
    const metricsSql = rankingMetricsSql(input.period)
    const [result, categories] = await Promise.all([
      queryBusiness<RankingQueryRow>(`
        with
        ${metricsSql.eventCountsCte}
        scoped_websites as (
          select
            website.id,
            website.name,
            website."desc",
            website.logo,
            website.url,
            website.tags,
            website.vpn,
            website."visitCount",
            website.created_at,
            coalesce(
              category_membership.categories,
              jsonb_build_array(jsonb_build_object('id', primary_category.id, 'name', primary_category.name))
            ) as categories,
            ${metricsSql.currentVisits} as current_visits,
            ${metricsSql.previousVisits} as previous_visits
          from public.ds_websites website
          join public.ds_categorys primary_category on primary_category.id = website.category_id
          left join lateral (
            select jsonb_agg(
              jsonb_build_object('id', linked_category.id, 'name', linked_category.name)
              order by category_link.position
            ) as categories
            from public.ds_website_categories category_link
            join public.ds_categorys linked_category on linked_category.id = category_link.category_id
            where category_link.website_id = website.id
          ) category_membership on true
          ${metricsSql.eventCountsJoin}
          where $1::uuid is null
            or exists (
              select 1
              from public.ds_website_categories filter_category
              where filter_category.website_id = website.id
                and filter_category.category_id = $1::uuid
            )
        ),
        ranked as (
          select
            scoped_websites.*,
            row_number() over (
              order by current_visits desc, "visitCount" desc, created_at, id
            )::int as current_rank,
            row_number() over (
              order by previous_visits desc nulls last, "visitCount" desc, created_at, id
            )::int as previous_rank_raw
          from scoped_websites
        )
        select
          id,
          name,
          "desc",
          logo,
          url,
          tags,
          vpn,
          "visitCount",
          categories,
          current_visits::text as "currentVisits",
          previous_visits::text as "previousVisits",
          current_rank as rank,
          case when previous_visits > 0 then previous_rank_raw else null end as "previousRank"
        from ranked
        where current_rank <= $2
        order by current_rank
      `, [input.categoryId ?? null, limit]),
      this.listCategoryOptions(),
    ])

    const websites = decorateRankingWebsites(result.rows.map((row) => {
      const currentVisits = Number(row.currentVisits)
      const previousVisits = row.previousVisits === null ? null : Number(row.previousVisits)
      const visitDelta = previousVisits === null ? null : currentVisits - previousVisits
      const rankDelta = row.previousRank === null ? null : row.previousRank - row.rank

      return {
        ...row,
        badges: [],
        currentVisits,
        growthRate: previousVisits && visitDelta !== null
          ? Math.round(visitDelta / previousVisits * 100)
          : null,
        previousVisits,
        rankDelta,
        visitDelta,
      }
    }), input.period)

    const fastestRiser = websites
      .filter(website => Number(website.rankDelta) > 0)
      .toSorted((left, right) => Number(right.rankDelta) - Number(left.rankDelta) || left.rank - right.rank)[0]

    return {
      categories,
      categoryId: input.categoryId ?? null,
      generatedAt: new Date().toISOString(),
      methodology: input.period === 'all'
        ? '累计有效访问；同一访客对同一网站 30 分钟内重复访问只计一次。'
        : `${RANKING_PERIOD_LABELS[input.period]}有效访问，并与上一等长周期比较；同一访客对同一网站 30 分钟内重复访问只计一次。`,
      period: input.period,
      periodLabel: RANKING_PERIOD_LABELS[input.period],
      summary: {
        activeSites: websites.filter(website => website.currentVisits > 0).length,
        fastestRiser: fastestRiser
          ? { id: fastestRiser.id, name: fastestRiser.name, rankDelta: Number(fastestRiser.rankDelta) }
          : null,
        newEntries: input.period === 'all'
          ? 0
          : websites.filter(website => website.currentVisits > 0 && website.previousRank === null).length,
        totalVisits: websites.reduce((total, website) => total + website.currentVisits, 0),
      },
      websites,
    }
  }

  async recordVisit(websiteId: string, visitorHash: string) {
    return withBusinessTransaction(async (client) => {
      const inserted = await client.query(`
        insert into public.ds_website_visit_events (website_id, visitor_hash, bucket_start)
        values (
          $1::uuid,
          $2,
          date_bin(interval '30 minutes', now(), timestamptz '2001-01-01 00:00:00+00')
        )
        on conflict do nothing
        returning id
      `, [websiteId, visitorHash])

      if (!inserted.rowCount)
        return false

      await client.query(`
        update public.ds_websites
        set "visitCount" = "visitCount" + 1
        where id = $1::uuid
      `, [websiteId])
      return true
    })
  }
}

async function findWebsite(client: Pool | PoolClient, id: string) {
  const result = await client.query<Website & { logo_file_id: string | null }>(`
    select website.*, row_to_json(category.*) as category,
           ${WEBSITE_CATEGORY_COLUMNS}
    from public.ds_websites website
    join public.ds_categorys category on category.id = website.category_id
    ${WEBSITE_CATEGORY_JOIN}
    where website.id = $1::uuid
  `, [id])
  return result.rows[0] ?? null
}

function rankingMetricsSql(period: RankingPeriod) {
  if (period === 'all') {
    return {
      currentVisits: `website."visitCount"::bigint`,
      eventCountsCte: '',
      eventCountsJoin: '',
      previousVisits: `null::bigint`,
    }
  }

  const window = RANKING_WINDOW_SQL[period]
  return {
    currentVisits: `coalesce(event_counts.current_visits, 0)::bigint`,
    eventCountsCte: `event_counts as (
        select
          event.website_id,
          count(*) filter (where ${window.currentCondition})::bigint as current_visits,
          count(*) filter (where ${window.previousCondition})::bigint as previous_visits
        from public.ds_website_visit_events event
        where ${window.scanCondition}
        group by event.website_id
      ),`,
    eventCountsJoin: `left join event_counts on event_counts.website_id = website.id`,
    previousVisits: `coalesce(event_counts.previous_visits, 0)::bigint`,
  }
}

export const catalogRepository = new CatalogRepository()

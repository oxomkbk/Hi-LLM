import 'server-only'

import { queryBusiness } from '@/lib/db/business'

import type { NavigationAiCandidate } from './types'

interface NavigationAiCandidateRow {
  categories: Array<{ name: string }>
  commonlyUsed: boolean
  desc: string | null
  id: string
  logo: string | null
  name: string
  pinned: boolean
  recommend: boolean
  tags: string[]
  url: string
  visitCount: number
  vpn: boolean
}

export async function listNavigationAiCandidates(): Promise<NavigationAiCandidate[]> {
  const result = await queryBusiness<NavigationAiCandidateRow>(`
    select
      website.id,
      website.name,
      website.url,
      website.logo,
      website.tags,
      website."desc",
      website.vpn,
      website.pinned,
      website.recommend,
      website."commonlyUsed",
      website."visitCount",
      coalesce(
        category_membership.categories,
        jsonb_build_array(jsonb_build_object('name', primary_category.name))
      ) as categories
    from public.ds_websites website
    join public.ds_categorys primary_category on primary_category.id = website.category_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('name', linked_category.name)
        order by link.position
      ) as categories
      from public.ds_website_categories link
      join public.ds_categorys linked_category on linked_category.id = link.category_id
      where link.website_id = website.id
    ) category_membership on true
    order by website."commonlyUsed" desc, website.recommend desc,
             website."visitCount" desc, website.sort desc, website.created_at desc
  `)

  return result.rows.map(row => ({
    categories: row.categories.map(category => category.name),
    commonlyUsed: row.commonlyUsed,
    description: row.desc?.trim() ?? '',
    id: row.id,
    logo: row.logo,
    name: row.name,
    pinned: row.pinned,
    recommend: row.recommend,
    tags: row.tags,
    url: row.url,
    visitCount: row.visitCount,
    vpn: row.vpn,
  }))
}

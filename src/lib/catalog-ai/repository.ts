import 'server-only'

import { catalogIconSource } from '@/lib/catalog-icons'
import { queryBusiness } from '@/lib/db/business'
import { listNavigationAiCandidates } from '@/lib/navigation-ai/repository'
import { generateLogoUrl } from '@/lib/utils'

import type { CatalogAiCandidate, CatalogAiScope } from './types'

const MAX_SEARCH_TERMS = 12

interface CatalogCandidateRow {
  categories: string[]
  commonlyUsed: boolean
  description: string
  external: boolean
  featured: boolean
  id: string
  image: string | null
  kind: string
  name: string
  pinned: boolean
  searchText: string
  tags: string[]
  url: string
  verified: boolean
  visitCount: number
  vpn: boolean
}

export async function listCatalogAiCandidates(scope: CatalogAiScope, searchTerms: string[] = []): Promise<CatalogAiCandidate[]> {
  if (scope === 'navigation') {
    const sites = await listNavigationAiCandidates()
    return sites.map(site => ({
      ...site,
      external: true,
      image: site.logo ? generateLogoUrl(site.logo) : null,
      kind: site.categories[0] || '网站',
      scope,
      searchText: site.description,
    }))
  }

  const terms = normalizeSearchTerms(searchTerms)
  const rows = scope === 'skills'
    ? await listSkillCandidates(terms)
    : scope === 'mcp'
      ? await listMcpCandidates(terms)
      : scope === 'prompts'
        ? await listPromptCandidates(terms)
        : scope === 'works'
          ? await listWorkCandidates(terms)
          : await listWonderlandCandidates(terms)

  return rows.map(row => ({
    categories: row.categories,
    commonlyUsed: row.commonlyUsed || row.verified,
    description: row.description.trim(),
    external: row.external,
    id: row.id,
    image: row.image,
    kind: row.kind,
    logo: row.image,
    name: row.name,
    pinned: row.pinned,
    recommend: row.featured,
    scope,
    searchText: row.searchText.trim(),
    tags: row.tags,
    url: row.url,
    visitCount: Number(row.visitCount || 0),
    vpn: row.vpn,
  }))
}

async function listMcpCandidates(terms: string[]) {
  const result = await queryBusiness<CatalogCandidateRow>(`
    select mcp.id::text as id, mcp.name, mcp.summary as description,
           left(mcp.description, 2400) as "searchText",
           mcp.icon as image, array[mcp.category]::text[] as categories,
           (mcp.tags || mcp.capabilities) as tags, 'MCP'::text as kind,
           '/mcp/' || mcp.slug as url,
           false as external, false as vpn, false as pinned,
           mcp.featured, mcp.verified, mcp.verified as "commonlyUsed",
           greatest(mcp.sort, 0) as "visitCount"
    from public.ds_mcps mcp
    cross join lateral (
      select count(*)::int as score
      from unnest($1::text[]) term
      where strpos(lower(concat_ws(' ', mcp.name, mcp.summary, mcp.description,
        mcp.category, mcp.tags::text, mcp.capabilities::text, mcp.clients::text)), term) > 0
    ) relevance
    where mcp.status = 'published'
      and (cardinality($1::text[]) = 0 or relevance.score > 0)
    order by relevance.score desc, mcp.featured desc, mcp.verified desc, mcp.sort desc,
             mcp.published_at desc, mcp.id desc
    limit 180
  `, [terms])
  return result.rows.map(row => ({ ...row, image: catalogIconSource(row.image) }))
}

async function listPromptCandidates(terms: string[]) {
  const result = await queryBusiness<CatalogCandidateRow & { assetId: string | null, slug: string }>(`
    select prompt.id::text as id, prompt.slug, prompt.title as name,
           prompt.summary as description, prompt.tags,
           coalesce(document_excerpt.content, '') as "searchText",
           case prompt.content_kind
             when 'image' then '图片 Prompt'
             when 'video' then '视频 Prompt'
             when 'web_ui' then '网页 Prompt'
             else '改编 Prompt'
           end as kind,
           coalesce(category_list.categories, array[]::text[]) as categories,
           cover.id::text as "assetId", null::text as image,
           '/prompts/' || prompt.slug as url,
           false as external, false as vpn, false as pinned,
           prompt.featured, false as verified, false as "commonlyUsed",
           greatest(prompt.sort, 0) as "visitCount"
    from public.ds_prompts prompt
    left join lateral (
      select array_agg(category.name order by link.position) as categories
      from public.ds_prompt_category_links link
      join public.ds_prompt_categories category on category.id = link.category_id
      where link.prompt_id = prompt.id
    ) category_list on true
    left join lateral (
      select left(string_agg(left(document.content, 1200), E'\n' order by document.is_primary desc, document.sort, document.id), 3600) as content
      from public.ds_prompt_documents document
      where document.prompt_id = prompt.id
    ) document_excerpt on true
    left join lateral (
      select asset.id
      from public.ds_prompt_assets asset
      join public.file_objects file on file.id = asset.file_id
      where asset.prompt_id = prompt.id and file.status = 'ready'
        and (asset.is_primary or asset.role in ('cover', 'image', 'video', 'web_preview'))
      order by asset.is_primary desc, asset.sort, asset.id
      limit 1
    ) cover on true
    cross join lateral (
      select count(*)::int as score
      from unnest($1::text[]) term
      where strpos(lower(concat_ws(' ', prompt.title, prompt.summary, prompt.tags::text,
        category_list.categories::text, document_excerpt.content)), term) > 0
    ) relevance
    where prompt.status = 'published'
      and (cardinality($1::text[]) = 0 or relevance.score > 0)
    order by relevance.score desc, prompt.featured desc, prompt.sort desc,
             prompt.published_at desc, prompt.id desc
    limit 180
  `, [terms])
  return result.rows.map(row => ({
    ...row,
    image: row.assetId
      ? `/api/public/prompts/${encodeURIComponent(row.slug)}/assets/${encodeURIComponent(row.assetId)}`
      : null,
  }))
}

async function listSkillCandidates(terms: string[]) {
  const result = await queryBusiness<CatalogCandidateRow>(`
    select skill.id::text as id, skill.name, skill.summary as description,
           left(skill.description, 2400) as "searchText",
           skill.icon as image, array[skill.category]::text[] as categories,
           skill.tags, skill.platforms[1] as kind,
           '/skills/' || skill.slug as url,
           false as external, false as vpn, false as pinned,
           skill.featured, skill.verified, skill.verified as "commonlyUsed",
           greatest(skill.sort, 0) as "visitCount"
    from public.ds_skills skill
    cross join lateral (
      select count(*)::int as score
      from unnest($1::text[]) term
      where strpos(lower(concat_ws(' ', skill.name, skill.summary, skill.description,
        skill.category, skill.tags::text, skill.platforms::text)), term) > 0
    ) relevance
    where skill.status = 'published'
      and (cardinality($1::text[]) = 0 or relevance.score > 0)
    order by relevance.score desc, skill.featured desc, skill.verified desc, skill.sort desc,
             skill.published_at desc, skill.id desc
    limit 180
  `, [terms])
  return result.rows.map(row => ({
    ...row,
    image: catalogIconSource(row.image),
    kind: row.kind || 'Skill',
  }))
}

async function listWonderlandCandidates(terms: string[]) {
  const result = await queryBusiness<CatalogCandidateRow>(`
    select candidate.id, candidate.name, candidate.description, candidate."searchText",
           candidate.image, candidate.categories, candidate.tags, candidate.kind,
           candidate.url, candidate.external, candidate.vpn, candidate.pinned,
           candidate.featured, candidate.verified, candidate."commonlyUsed",
           candidate."visitCount"
    from (
      select ('question:' || question.id::text) as id, question.title as name,
             question.summary as description, left(question.content_text, 3000) as "searchText",
             null::text as image, array[category.name]::text[] as categories,
             coalesce(tag_list.tags, array[]::text[]) as tags,
             '问题'::text as kind, '/wonderland/questions/' || question.slug as url,
             false as external, false as vpn, false as pinned, false as featured,
             (question.accepted_answer_id is not null) as verified,
             (question.answer_count > 0) as "commonlyUsed",
             greatest(question.view_count + question.answer_count * 8 + question.vote_score * 3, 0) as "visitCount",
             question.created_at as "publishedAt"
      from public.wonder_questions question
      join public.wonder_categories category on category.id = question.category_id
      left join lateral (
        select array_agg(tag.name order by link.position) as tags
        from public.wonder_question_tags link
        join public.wonder_tags tag on tag.id = link.tag_id
        where link.question_id = question.id
      ) tag_list on true
      where question.visibility = 'visible'

      union all

      select ('news:' || article.id::text), article.title, article.summary,
             left(article.content_text, 3000),
             case when article.cover_file_id is null then null else '/api/files/' || article.cover_file_id::text end,
             array[category.name]::text[], array[]::text[], '社区新闻'::text,
             '/wonderland/news/' || article.slug,
             false, false, article.pinned, article.featured, true, false,
             greatest(article.comment_count * 5, 0), article.published_at
      from public.wonder_news_articles article
      join public.wonder_categories category on category.id = article.category_id
      where article.status = 'published' and article.published_at <= now()
    ) candidate
    cross join lateral (
      select count(*)::int as score
      from unnest($1::text[]) term
      where strpos(lower(concat_ws(' ', candidate.name, candidate.description,
        candidate."searchText", candidate.categories::text, candidate.tags::text)), term) > 0
    ) relevance
    where cardinality($1::text[]) = 0 or relevance.score > 0
    order by relevance.score desc, candidate."publishedAt" desc, candidate.pinned desc,
             candidate.featured desc, candidate."visitCount" desc
    limit 180
  `, [terms])
  return result.rows
}

async function listWorkCandidates(terms: string[]) {
  const result = await queryBusiness<CatalogCandidateRow>(`
    select ('work:' || work.id::text) as id, work.title as name,
           work.summary as description, left(work.content_text, 3600) as "searchText",
           '/api/files/' || work.cover_file_id::text as image,
           array['作品广场']::text[] as categories, work.tags,
           case work.kind
             when 'app' then '应用'
             when 'game' then '游戏'
             when 'library' then '开源库'
             when 'plugin' then '插件'
             when 'template' then '模板'
             else '其他作品'
           end as kind,
           '/wonderland/works/' || work.slug as url,
           false as external, false as vpn, false as pinned,
           work.featured, false as verified, (work.like_count > 0) as "commonlyUsed",
           greatest(work.view_count + work.like_count * 8, 0) as "visitCount"
    from public.wonder_works work
    cross join lateral (
      select count(*)::int as score
      from unnest($1::text[]) term
      where strpos(lower(concat_ws(' ', work.title, work.summary, work.content_text,
        work.kind, work.tags::text)), term) > 0
    ) relevance
    where work.visibility = 'visible'
      and (cardinality($1::text[]) = 0 or relevance.score > 0)
    order by relevance.score desc, work.featured desc, work.published_at desc,
             work.like_count desc, work.view_count desc, work.id desc
    limit 180
  `, [terms])
  return result.rows
}

function normalizeSearchTerms(terms: string[]) {
  return Array.from(new Set(terms
    .map(term => term.trim().toLocaleLowerCase('zh-CN'))
    .filter(term => term.length >= 2 && term.length <= 48)))
    .slice(0, MAX_SEARCH_TERMS)
}

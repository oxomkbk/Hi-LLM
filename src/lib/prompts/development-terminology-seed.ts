import 'server-only'

import { invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { buildPromptDeclaredSnapshot } from '@/lib/ai-security/subjects'

import {
  DEVELOPMENT_TERMINOLOGY_CATEGORIES,
  DEVELOPMENT_TERMINOLOGY_COLLECTIONS,
  DEVELOPMENT_TERMINOLOGY_ROOT_CATEGORY_SLUG,
} from './development-terminology-data'
import { buildDevelopmentTerminologyPreviewDocuments } from './development-terminology-previews'
import {
  parsePromptGlossaryContent,
  PROMPT_GLOSSARY_LANGUAGE,
  promptGlossaryItemCount,
} from './glossary'
import { parseAndValidateGlossaryPreviewBundle } from './glossary-preview-security'

import type { DevelopmentTerminologyCategorySeed, DevelopmentTerminologyCollectionSeed } from './development-terminology-data'
import type { PromptDocumentInput } from '@/types'
import type { PoolClient } from 'pg'

const FORBIDDEN_SOURCE_PATTERN = /vibe.?hub|\boil\b|oiloil\.org|https?:\/\/|www\./i

export interface DevelopmentTerminologySeedResult {
  categories: number
  created: number
  prompts: number
  securityInvalidated: number
  unchanged: number
  updated: number
}

interface CategoryRow {
  id: string
  kind: 'adaptation' | 'general' | 'image' | 'video' | 'web_ui' | null
  parent_id: string | null
}

interface DocumentRow {
  content: string
  is_primary: boolean
  language: string
  name: string
  role: string
  sort: number
  source_path: string
}

interface LinkRow {
  is_primary: boolean
  position: number
  slug: string
}

interface ManagedPromptRow {
  compatibility: string[]
  content_kind: string
  featured: boolean
  id: string
  preview_status: string
  published_at: Date | null
  slug: string
  sort: number
  source_import_id: string | null
  status: string
  submission_origin: string
  summary: string
  tags: string[]
  title: string
}

export function assertDevelopmentTerminologyCatalog() {
  if (DEVELOPMENT_TERMINOLOGY_COLLECTIONS.length !== 13)
    throw new Error('开发术语合集必须为 13 个')
  const slugs = new Set<string>()
  const sourceImportIds = new Set<string>()
  const terms = new Set<string>()
  let total = 0
  for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
    if (slugs.has(collection.slug) || sourceImportIds.has(collection.sourceImportId))
      throw new Error(`开发术语合集标识重复：${collection.slug}`)
    slugs.add(collection.slug)
    sourceImportIds.add(collection.sourceImportId)
    const content = JSON.stringify(collection.document)
    const parsed = parsePromptGlossaryContent(content)
    if (!parsed)
      throw new Error(`开发术语文档无效：${collection.slug}`)
    const count = promptGlossaryItemCount(parsed)
    if (count !== collection.expectedCount)
      throw new Error(`开发术语数量不一致：${collection.slug}`)
    total += count
    for (const section of parsed.sections) {
      for (const item of section.items) {
        if (terms.has(item.term))
          throw new Error(`开发术语重复：${item.term}`)
        terms.add(item.term)
      }
    }
    const publicContent = JSON.stringify({
      compatibility: collection.compatibility,
      document: collection.document,
      summary: collection.summary,
      tags: collection.tags,
      title: collection.title,
    })
    if (FORBIDDEN_SOURCE_PATTERN.test(publicContent))
      throw new Error(`开发术语内容包含来源品牌或链接：${collection.slug}`)
    const previewDocuments = buildDevelopmentTerminologyPreviewDocuments(collection)
    parseAndValidateGlossaryPreviewBundle(previewDocuments, collection.document, { requireComplete: true })
    if (FORBIDDEN_SOURCE_PATTERN.test(JSON.stringify(previewDocuments)))
      throw new Error(`开发术语预览包含来源品牌或链接：${collection.slug}`)
  }
  if (total !== 281 || terms.size !== 281)
    throw new Error(`开发术语总数必须为 281，当前为 ${total}`)
}

export async function seedDevelopmentTerminology(client: PoolClient): Promise<DevelopmentTerminologySeedResult> {
  assertDevelopmentTerminologyCatalog()
  const categories = new Map<string, string>()
  for (const seed of DEVELOPMENT_TERMINOLOGY_CATEGORIES) {
    const parentId = seed.parentSlug ? categories.get(seed.parentSlug) : null
    if (seed.parentSlug && !parentId)
      throw new Error(`术语分类父级尚未创建：${seed.parentSlug}`)
    categories.set(seed.slug, await upsertCategory(client, seed, parentId ?? null))
  }

  const rootCategoryId = categories.get(DEVELOPMENT_TERMINOLOGY_ROOT_CATEGORY_SLUG)
  if (!rootCategoryId)
    throw new Error('开发术语父分类创建失败')

  const result: DevelopmentTerminologySeedResult = {
    categories: categories.size,
    created: 0,
    prompts: DEVELOPMENT_TERMINOLOGY_COLLECTIONS.length,
    securityInvalidated: 0,
    unchanged: 0,
    updated: 0,
  }

  for (const seed of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
    const childCategoryId = categories.get(seed.childCategorySlug)
    if (!childCategoryId)
      throw new Error(`术语合集分类不存在：${seed.childCategorySlug}`)
    const outcome = await upsertCollection(client, seed, rootCategoryId, childCategoryId)
    result[outcome.kind] += 1
    if (outcome.securityInvalidated)
      result.securityInvalidated += 1
  }

  return result
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isDocumentCorrect(rows: DocumentRow[], expected: PromptDocumentInput[]) {
  return rows.length === expected.length && rows.every((row, index) => {
    const document = expected[index]
    return document
      && row.source_path === document.sourcePath
      && row.name === document.name
      && row.role === document.role
      && row.language === document.language
      && row.content === document.content
      && row.sort === index
      && row.is_primary === document.isPrimary
  })
}

function isLegacyDocumentCorrect(rows: DocumentRow[], content: string) {
  const row = rows[0]
  return rows.length === 1 && row?.source_path === 'GLOSSARY.json' && row.content === content
    && row.role === 'prompt' && row.language === PROMPT_GLOSSARY_LANGUAGE && row.is_primary
}

function isLinksCorrect(rows: LinkRow[], childCategorySlug: string) {
  return rows.length === 2
    && rows[0]?.slug === childCategorySlug
    && rows[0].is_primary === true
    && rows[0].position === 0
    && rows[1]?.slug === DEVELOPMENT_TERMINOLOGY_ROOT_CATEGORY_SLUG
    && rows[1].is_primary === false
    && rows[1].position === 1
}

function isPromptCorrect(row: ManagedPromptRow, seed: DevelopmentTerminologyCollectionSeed) {
  return row.title === seed.title
    && row.summary === seed.summary
    && row.content_kind === 'adaptation'
    && arraysEqual(row.tags, seed.tags)
    && arraysEqual(row.compatibility, seed.compatibility)
    && row.featured === seed.featured
    && row.sort === seed.sort
    && row.preview_status === 'none'
    && row.status === 'published'
    && row.submission_origin === 'admin'
    && row.source_import_id === seed.sourceImportId
    && row.published_at !== null
}

async function upsertCategory(
  client: PoolClient,
  seed: DevelopmentTerminologyCategorySeed,
  parentId: string | null,
) {
  const existing = await client.query<CategoryRow>(`
    select id, parent_id, kind
    from public.ds_prompt_categories
    where slug = $1
    for update
  `, [seed.slug])
  const row = existing.rows[0]
  if (row) {
    if (row.parent_id !== parentId || row.kind !== seed.kind)
      throw new Error(`术语分类 slug 已被其他结构占用：${seed.slug}`)
    await client.query(`
      update public.ds_prompt_categories
      set name = $2, description = $3, sort = $4, active = true
      where id = $1::uuid
        and (name, description, sort, active) is distinct from ($2, $3, $4, true)
    `, [row.id, seed.name, seed.description, seed.sort])
    return row.id
  }
  const inserted = await client.query<{ id: string }>(`
    insert into public.ds_prompt_categories (
      parent_id, slug, name, description, kind, sort, active
    ) values ($1::uuid, $2, $3, $4, $5, $6, true)
    returning id
  `, [parentId, seed.slug, seed.name, seed.description, seed.kind, seed.sort])
  return inserted.rows[0]!.id
}

async function upsertCollection(
  client: PoolClient,
  seed: DevelopmentTerminologyCollectionSeed,
  rootCategoryId: string,
  childCategoryId: string,
): Promise<{ kind: 'created' | 'unchanged' | 'updated', securityInvalidated: boolean }> {
  const content = JSON.stringify(seed.document)
  const expectedDocuments: PromptDocumentInput[] = [
    { content, isPrimary: true, language: PROMPT_GLOSSARY_LANGUAGE, name: '术语表达', role: 'prompt', sourcePath: 'GLOSSARY.json' },
    ...buildDevelopmentTerminologyPreviewDocuments(seed),
  ]
  parseAndValidateGlossaryPreviewBundle(expectedDocuments, seed.document, { requireComplete: true })
  const expectedFingerprint = buildPromptDeclaredSnapshot({
    assets: [],
    compatibility: seed.compatibility,
    contentKind: 'adaptation',
    documents: expectedDocuments.map(document => ({ content: document.content, language: document.language, path: document.sourcePath, role: document.role })),
    summary: seed.summary,
    title: seed.title,
  }).fingerprint
  const existing = await client.query<ManagedPromptRow>(`
    select id, slug, title, summary, content_kind, tags, compatibility,
           featured, sort, preview_status, status, submission_origin,
           source_import_id, published_at
    from public.ds_prompts
    where slug = $1
    for update
  `, [seed.slug])
  const current = existing.rows[0] ?? null
  if (current && current.source_import_id !== seed.sourceImportId)
    throw new Error(`术语 Prompt slug 已被其他内容占用：${seed.slug}`)

  const hadSecurityState = current
    ? Boolean((await client.query<{ exists: boolean }>(`
        select exists (
          select 1 from public.ds_ai_security_subject_states
          where subject_type = 'prompt' and subject_id = $1::uuid
        ) as exists
      `, [current.id])).rows[0]?.exists)
    : false

  let prompt = current
  let promptCorrect = current ? isPromptCorrect(current, seed) : false
  if (!prompt) {
    const inserted = await client.query<ManagedPromptRow>(`
      insert into public.ds_prompts (
        slug, title, summary, content_kind, tags, compatibility, featured, sort,
        preview_status, status, submission_origin, source_import_id, published_at
      ) values (
        $1, $2, $3, 'adaptation', $4::text[], $5::text[], $6, $7,
        'none', 'published', 'admin', $8::uuid, now()
      ) returning id, slug, title, summary, content_kind, tags, compatibility,
                  featured, sort, preview_status, status, submission_origin,
                  source_import_id, published_at
    `, [seed.slug, seed.title, seed.summary, seed.tags, seed.compatibility, seed.featured, seed.sort, seed.sourceImportId])
    prompt = inserted.rows[0]!
    promptCorrect = true
  }

  const documents = await client.query<DocumentRow>(`
    select source_path, name, role, language, content, sort, is_primary
    from public.ds_prompt_documents where prompt_id = $1::uuid
    order by sort, id
  `, [prompt.id])
  const links = await client.query<LinkRow>(`
    select category.slug, link.is_primary, link.position
    from public.ds_prompt_category_links link
    join public.ds_prompt_categories category on category.id = link.category_id
    where link.prompt_id = $1::uuid
    order by link.position, category.slug
  `, [prompt.id])
  const assets = await client.query<{ total: number }>(`
    select count(*)::int as total from public.ds_prompt_assets where prompt_id = $1::uuid
  `, [prompt.id])
  if (Number(assets.rows[0]?.total ?? 0) !== 0)
    throw new Error(`托管术语 Prompt 不允许附加资源：${seed.slug}`)
  const oldFingerprint = current
    ? buildPromptDeclaredSnapshot({
      assets: [],
      compatibility: current.compatibility,
      contentKind: current.content_kind,
      documents: documents.rows.map(document => ({
        content: document.content,
        language: document.language,
        path: document.source_path,
        role: document.role,
      })),
      summary: current.summary,
      title: current.title,
    }).fingerprint
    : null

  const documentsCorrect = isDocumentCorrect(documents.rows, expectedDocuments)
  const linksCorrect = isLinksCorrect(links.rows, seed.childCategorySlug)
  if (current && promptCorrect && documentsCorrect && linksCorrect) {
    const shouldInvalidate = !hadSecurityState
    if (shouldInvalidate)
      await invalidateSecurityState(client, { id: prompt.id, type: 'prompt' }, expectedFingerprint)
    return { kind: 'unchanged', securityInvalidated: shouldInvalidate }
  }

  if (!promptCorrect) {
    await client.query(`
      update public.ds_prompts
      set title = $2, summary = $3, content_kind = 'adaptation',
          tags = $4::text[], compatibility = $5::text[], featured = $6, sort = $7,
          preview_status = 'none', status = 'published', submission_origin = 'admin',
          published_at = coalesce(published_at, now())
      where id = $1::uuid
    `, [prompt.id, seed.title, seed.summary, seed.tags, seed.compatibility, seed.featured, seed.sort])
  }
  if (!documentsCorrect) {
    const legacyBootstrap = isLegacyDocumentCorrect(documents.rows, content)
    if (current?.status === 'published' && !legacyBootstrap)
      throw new Error(`已发布术语预览不能由种子直接覆盖，请先归档：${seed.slug}`)
    await client.query('delete from public.ds_prompt_documents where prompt_id = $1::uuid', [prompt.id])
    for (const [sort, document] of expectedDocuments.entries()) {
      await client.query(`
        insert into public.ds_prompt_documents (
          prompt_id, source_path, name, role, language, content, sort, is_primary
        ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
      `, [prompt.id, document.sourcePath, document.name, document.role, document.language, document.content, sort, document.isPrimary])
    }
  }
  if (!linksCorrect) {
    await client.query('delete from public.ds_prompt_category_links where prompt_id = $1::uuid', [prompt.id])
    await client.query(`
      insert into public.ds_prompt_category_links (prompt_id, category_id, is_primary, position)
      values ($1::uuid, $2::uuid, true, 0), ($1::uuid, $3::uuid, false, 1)
    `, [prompt.id, childCategoryId, rootCategoryId])
  }

  const shouldInvalidate = !hadSecurityState || oldFingerprint !== expectedFingerprint
  if (shouldInvalidate)
    await invalidateSecurityState(client, { id: prompt.id, type: 'prompt' }, expectedFingerprint)
  return { kind: current ? 'updated' : 'created', securityInvalidated: shouldInvalidate }
}

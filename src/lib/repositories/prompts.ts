import 'server-only'

import { deleteSecuritySubjectState, invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { securityJoins, securityProjection } from '@/lib/ai-security/public-projection'
import { evaluateAiContentPublishGate } from '@/lib/ai-security/publish-gate'
import { loadSecuritySubjectSnapshot } from '@/lib/ai-security/subject-repository'
import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { validatePromptGlossaryPreviewDocuments } from '../prompts/glossary-preview-security'

import type { Actor, PageResult } from './catalog'
import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type {
  Prompt,
  PromptAsset,
  PromptCategory,
  PromptContentKind,
  PromptDetail,
  PromptDocument,
  PromptSaveInput,
  PromptStatus,
  PromptSubmissionOrigin,
} from '@/types'
import type { PoolClient } from 'pg'

interface PromptCategoryLinkRow extends PromptCategory {
  is_primary: boolean
  position: number
  prompt_id: string
}

interface PromptFilters {
  category?: string
  featured?: boolean | null
  kind?: PromptContentKind | null
  limit: number
  offset: number
  origin?: PromptSubmissionOrigin | null
  publishedOnly?: boolean
  q?: string
  sortMode?: PublicCatalogSort
  status?: PromptStatus | null
}

type PromptRow = Omit<Prompt, 'categories' | 'cover_asset' | 'primary_category_id'>

const MAX_COMMUNITY_PROMPT_ASSETS = 12

interface CommunityPromptAssetSaveInput extends Omit<PromptAssetSaveInput, 'importId' | 'origin' | 'sourcePath'> {
  assetKey: string
}

interface PromptAssetSaveInput {
  altText?: string | null
  fileId: string
  importId?: string | null
  isDownloadable?: boolean
  isEntrypoint?: boolean
  isPrimary?: boolean
  name: string
  origin: PromptAsset['origin']
  role: PromptAsset['role']
  sourcePath: string
}

export class PromptRepository {
  async list(filters: PromptFilters): Promise<PageResult<Prompt>> {
    const { values, where } = buildFilters(filters)
    const count = await queryBusiness<{ total: string }>(`
      select count(distinct prompt.id)::text as total
      from public.ds_prompts prompt
      ${filters.category ? 'join public.ds_prompt_category_links category_link on category_link.prompt_id = prompt.id join public.ds_prompt_categories filter_category on filter_category.id = category_link.category_id' : ''}
      ${where}
    `, values)
    values.push(filters.limit, filters.offset)
    const rows = await queryBusiness<PromptRow>(`
      select distinct prompt.*, ${securityProjection(filters.publishedOnly === true)}
      from public.ds_prompts prompt
      ${securityJoins('prompt', 'prompt')}
      ${filters.category ? 'join public.ds_prompt_category_links category_link on category_link.prompt_id = prompt.id join public.ds_prompt_categories filter_category on filter_category.id = category_link.category_id' : ''}
      ${where}
      order by ${filters.sortMode === 'latest'
        ? `${filters.publishedOnly ? 'prompt.published_at' : 'prompt.created_at'} desc, prompt.id desc`
        : `prompt.featured desc, prompt.sort desc,
               ${filters.publishedOnly ? 'prompt.published_at' : 'prompt.created_at'} desc, prompt.id`}
      limit $${values.length - 1} offset $${values.length}
    `, values)
    return {
      list: await this.hydrate(rows.rows),
      total: Number(count.rows[0]?.total ?? 0),
    }
  }

  async listCategories(options: { activeOnly?: boolean } = {}) {
    const result = await queryBusiness<PromptCategory>(`
      select * from public.ds_prompt_categories
      ${options.activeOnly ? 'where active = true' : ''}
      order by parent_id nulls first, sort desc, name, id
    `)
    return result.rows
  }

  async findById(id: string) {
    return this.findDetail('prompt.id = $1::uuid', id, false)
  }

  async findPublishedBySlug(slug: string) {
    return this.findDetail(`prompt.slug = $1 and prompt.status = 'published'`, slug, true)
  }

  async findPublishedDocument(slug: string, documentId: string) {
    const result = await queryBusiness<PromptDocument>(`
      select document.*
      from public.ds_prompt_documents document
      join public.ds_prompts prompt on prompt.id = document.prompt_id
      where prompt.slug = $1 and prompt.status = 'published' and document.id = $2::uuid
      limit 1
    `, [slug, documentId])
    return result.rows[0] ?? null
  }

  async create(input: PromptSaveInput, actor: Actor, options: { origin?: 'admin' | 'community' } = {}) {
    validatePromptGlossaryPreviewDocuments(input.documents, input.status)
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      await validateCategories(client, input)
      const requestedPublish = input.status === 'published'
      const created = await client.query<PromptRow>(`
        insert into public.ds_prompts (
          slug, title, summary, content_kind, tags, compatibility, featured, sort,
          status, submission_origin, submitted_at,
          created_by, updated_by, published_by, published_at
        ) values (
          $1, $2, $3, $4, $5::text[], $6::text[], $7, $8,
          $9, $10, null,
          $11::uuid, $11::uuid, null, null
        ) returning *
      `, [input.slug, input.title, input.summary, input.contentKind, input.tags, input.compatibility, input.featured, input.sort, requestedPublish ? 'draft' : input.status, options.origin ?? 'admin', actor.id])
      const prompt = created.rows[0]!
      await replaceLinksAndDocuments(client, prompt.id, input)
      await syncEditorAssets(client, prompt.id, input, actor.id, options.origin ?? 'admin')
      if (requestedPublish) {
        const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', prompt.id)
        await invalidateSecurityState(client, { id: prompt.id, type: 'prompt' }, snapshot.declaredFingerprint)
        const gate = await evaluateAiContentPublishGate(client, 'prompt', { id: prompt.id, type: 'prompt' }, snapshot.declaredFingerprint)
        await client.query(`
          update public.ds_prompts
          set status = case when $2 then 'published' else 'draft' end,
              published_by = case when $2 then $3::uuid else null end,
              published_at = case when $2 then now() else null end,
              publish_requested_at = case when $2 then null else now() end
          where id = $1::uuid
        `, [prompt.id, gate.allowed, actor.id])
      }
      return (await this.findByIdWithClient(client, prompt.id))!
    })
  }

  async isOwnedCommunityDraft(id: string, userId: string, options: { completed?: boolean } = {}) {
    const result = await queryBusiness<{ id: string }>(`
      select id from public.ds_prompts
      where id = $1::uuid and created_by = $2::uuid
        and status = 'draft' and submission_origin = 'community'
        ${options.completed === true ? 'and submitted_at is not null' : options.completed === false ? 'and submitted_at is null' : ''}
      limit 1
    `, [id, userId])
    return Boolean(result.rows[0])
  }

  async finalizeCommunitySubmission(id: string, userId: string) {
    return withBusinessTransaction(async (client) => {
      await lockOwnedCommunityDraft(client, id, userId)
      const result = await client.query<{ id: string }>(`
        update public.ds_prompts
        set submitted_at = now()
        where id = $1::uuid and created_by = $2::uuid
          and status = 'draft' and submission_origin = 'community'
          and submitted_at is null
        returning id
      `, [id, userId])
      if (!result.rows[0])
        throw communityDraftUnavailable()
      return result.rows[0]
    })
  }

  async listOwnedCommunityDraftAssets(id: string, userId: string) {
    return withBusinessTransaction(async (client) => {
      await lockOwnedCommunityDraft(client, id, userId)
      const result = await client.query<PromptAsset>(`
        select asset.*, file.mime_type, file.size_bytes
        from public.ds_prompt_assets asset
        join public.file_objects file on file.id = asset.file_id
        where asset.prompt_id = $1::uuid
        order by asset.sort, asset.id
      `, [id])
      return result.rows
    })
  }

  async attachCommunityAsset(promptId: string, userId: string, input: CommunityPromptAssetSaveInput) {
    return withBusinessTransaction(async (client) => {
      await lockOwnedCommunityDraft(client, promptId, userId)
      const file = await client.query<{ id: string }>(`
        select id from public.file_objects
        where id = $1::uuid and owner_id = $2::uuid and status = 'ready'
        for share
      `, [input.fileId, userId])
      if (!file.rows[0])
        throw new PromptRepositoryError('请选择本人刚刚上传完成的 Prompt 资源', 409, 'PROMPT_ASSET_FILE_UNAVAILABLE')

      const sourcePath = `uploads/${input.assetKey}`
      const existing = await client.query<PromptAsset>(`
        select * from public.ds_prompt_assets
        where prompt_id = $1::uuid and (source_path = $2 or file_id = $3::uuid)
        limit 1
      `, [promptId, sourcePath, input.fileId])
      if (existing.rows[0])
        return { asset: existing.rows[0], created: false }

      const count = await client.query<{ total: number }>(`
        select count(*)::int as total
        from public.ds_prompt_assets
        where prompt_id = $1::uuid
      `, [promptId])
      if (Number(count.rows[0]?.total ?? 0) >= MAX_COMMUNITY_PROMPT_ASSETS)
        throw new PromptRepositoryError(`单个投稿最多添加 ${MAX_COMMUNITY_PROMPT_ASSETS} 个资源`, 409, 'PROMPT_ASSET_LIMIT_REACHED')

      if (input.isPrimary)
        await client.query(`update public.ds_prompt_assets set is_primary = false where prompt_id = $1::uuid`, [promptId])
      if (input.isEntrypoint)
        await client.query(`update public.ds_prompt_assets set is_entrypoint = false where prompt_id = $1::uuid`, [promptId])
      const inserted = await client.query<PromptAsset>(`
        insert into public.ds_prompt_assets (
          prompt_id, file_id, import_id, source_path, name, role, origin,
          is_primary, is_entrypoint, is_downloadable, alt_text
        ) values ($1::uuid, $2::uuid, null, $3, $4, $5, 'library_reference', $6, $7, $8, $9)
        returning *
      `, [promptId, input.fileId, sourcePath, input.name, input.role, input.isPrimary ?? false, input.isEntrypoint ?? false, input.isDownloadable ?? false, input.altText ?? null])
      const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', promptId)
      await invalidateSecurityState(client, { id: promptId, type: 'prompt' }, snapshot.declaredFingerprint)
      return { asset: inserted.rows[0]!, created: true }
    })
  }

  async removeCommunityAsset(promptId: string, assetId: string, userId: string) {
    return withBusinessTransaction(async (client) => {
      await lockOwnedCommunityDraft(client, promptId, userId)
      const asset = await client.query<Pick<PromptAsset, 'file_id' | 'id' | 'origin'>>(`
        select id, file_id, origin
        from public.ds_prompt_assets
        where prompt_id = $1::uuid and id = $2::uuid
        for update
      `, [promptId, assetId])
      if (!asset.rows[0])
        return null
      if (!['direct_upload', 'library_reference'].includes(asset.rows[0].origin))
        throw new PromptRepositoryError('包内资源需要随 Prompt 一起保留', 409, 'PROMPT_ASSET_NOT_REMOVABLE')
      const removed = await client.query<Pick<PromptAsset, 'file_id' | 'id'>>(`
        delete from public.ds_prompt_assets
        where prompt_id = $1::uuid and id = $2::uuid
        returning id, file_id
      `, [promptId, assetId])
      const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', promptId)
      await invalidateSecurityState(client, { id: promptId, type: 'prompt' }, snapshot.declaredFingerprint)
      return removed.rows[0] ?? null
    })
  }

  async update(id: string, input: PromptSaveInput, actor: Actor, current: PromptDetail) {
    validatePromptGlossaryPreviewDocuments(input.documents, input.status)
    assertTransition(current.status, input.status)
    const requiresPublishGate = input.status === 'published'
    const stagedPublish = requiresPublishGate && current.status !== 'published'
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      await validateCategories(client, input)
      await client.query(`
        update public.ds_prompts set
          slug = $2, title = $3, summary = $4, content_kind = $5,
          tags = $6::text[], compatibility = $7::text[], featured = $8,
          sort = $9, status = $10, updated_by = $11::uuid,
          publish_requested_at = case when $10 = 'draft' then null else publish_requested_at end,
          published_by = case when $10 = 'published' then coalesce(published_by, $11::uuid) else published_by end,
          published_at = case when $10 = 'published' then coalesce(published_at, now()) else published_at end
        where id = $1::uuid
      `, [id, input.slug, input.title, input.summary, input.contentKind, input.tags, input.compatibility, input.featured, input.sort, stagedPublish ? 'draft' : input.status, actor.id])
      if (input.status === 'draft' && current.status === 'archived') {
        await client.query(`update public.ds_prompts set published_at = null, published_by = null where id = $1::uuid`, [id])
      }
      await replaceLinksAndDocuments(client, id, input)
      await syncEditorAssets(client, id, input, actor.id, 'admin')
      const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', id)
      await invalidateSecurityState(client, { id, type: 'prompt' }, snapshot.declaredFingerprint)
      if (requiresPublishGate) {
        const gate = await evaluateAiContentPublishGate(
          client,
          'prompt',
          { id, type: 'prompt' },
          snapshot.declaredFingerprint,
        )
        if (gate.allowed && stagedPublish) {
          await client.query(`
            update public.ds_prompts
            set status = 'published', published_by = $2::uuid,
                published_at = coalesce(published_at, now()), publish_requested_at = null
            where id = $1::uuid
          `, [id, actor.id])
        }
        else if (!gate.allowed && stagedPublish) {
          await client.query(`update public.ds_prompts set publish_requested_at = now() where id = $1::uuid`, [id])
        }
        else if (!gate.allowed) {
          throw new PromptRepositoryError(`${gate.message}；原发布版本保持不变`, 409, 'PROMPT_SECURITY_GATE_BLOCKED')
        }
      }
      return (await this.findByIdWithClient(client, id))!
    })
  }

  async delete(id: string) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<{ id: string }>(`
        delete from public.ds_prompts
        where id = $1::uuid and status in ('draft', 'archived')
        returning id
      `, [id])
      if (result.rows[0])
        await deleteSecuritySubjectState(client, { id, type: 'prompt' })
      return result.rows[0] ?? null
    })
  }

  async createCategory(input: { active: boolean, description: string | null, kind: PromptContentKind | 'general' | null, name: string, parentId: string | null, slug: string, sort: number }) {
    const result = await queryBusiness<PromptCategory>(`
      insert into public.ds_prompt_categories (parent_id, slug, name, description, kind, sort, active)
      values ($1::uuid, $2, $3, $4, $5, $6, $7) returning *
    `, [input.parentId, input.slug, input.name, input.description, input.kind, input.sort, input.active])
    return result.rows[0]!
  }

  async updateCategory(id: string, input: { active: boolean, description: string | null, kind: PromptContentKind | 'general' | null, name: string, parentId: string | null, slug: string, sort: number }) {
    const result = await queryBusiness<PromptCategory>(`
      update public.ds_prompt_categories set parent_id = $2::uuid, slug = $3, name = $4,
        description = $5, kind = $6, sort = $7, active = $8
      where id = $1::uuid returning *
    `, [id, input.parentId, input.slug, input.name, input.description, input.kind, input.sort, input.active])
    return result.rows[0] ?? null
  }

  async deleteCategory(id: string) {
    const result = await queryBusiness<{ id: string }>(`
      delete from public.ds_prompt_categories category
      where category.id = $1::uuid
        and not exists (select 1 from public.ds_prompt_categories child where child.parent_id = category.id)
        and not exists (select 1 from public.ds_prompt_category_links link where link.category_id = category.id)
      returning id
    `, [id])
    return result.rows[0] ?? null
  }

  async attachAsset(promptId: string, input: PromptAssetSaveInput) {
    return withBusinessTransaction(async (client) => {
      const file = await client.query<{ id: string }>(`
        select id from public.file_objects
        where id = $1::uuid and status = 'ready'
        for share
      `, [input.fileId])
      if (!file.rows[0])
        throw new PromptRepositoryError('素材不存在或尚未上传完成', 409, 'PROMPT_ASSET_FILE_UNAVAILABLE')
      if (input.isPrimary)
        await client.query(`update public.ds_prompt_assets set is_primary = false where prompt_id = $1::uuid`, [promptId])
      if (input.isEntrypoint)
        await client.query(`update public.ds_prompt_assets set is_entrypoint = false where prompt_id = $1::uuid`, [promptId])
      const result = await client.query<PromptAsset>(`
        insert into public.ds_prompt_assets (
          prompt_id, file_id, import_id, source_path, name, role, origin,
          is_primary, is_entrypoint, is_downloadable, alt_text
        ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *
      `, [promptId, input.fileId, input.importId ?? null, input.sourcePath, input.name, input.role, input.origin, input.isPrimary ?? false, input.isEntrypoint ?? false, input.isDownloadable ?? false, input.altText ?? null])
      const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', promptId)
      await invalidateSecurityState(client, { id: promptId, type: 'prompt' }, snapshot.declaredFingerprint)
      return result.rows[0]!
    })
  }

  async findPublicAsset(slug: string, assetId: string, downloadableOnly = false) {
    const result = await queryBusiness<PromptAsset & { extension: string, mime_type: string, object_key: string, size_bytes: string, storage_profile_id: string }>(`
      select asset.*, file.extension, file.mime_type, file.object_key,
             file.size_bytes, file.storage_profile_id
      from public.ds_prompt_assets asset
      join public.ds_prompts prompt on prompt.id = asset.prompt_id
      join public.file_objects file on file.id = asset.file_id
      where prompt.slug = $1 and prompt.status = 'published'
        and asset.id = $2::uuid and file.status = 'ready'
        ${downloadableOnly ? 'and asset.is_downloadable = true' : ''}
      limit 1
    `, [slug, assetId])
    return result.rows[0] ?? null
  }

  async findPublicPreviewAsset(slug: string, sourcePath?: string) {
    const result = await queryBusiness<PromptAsset & { extension: string, mime_type: string, object_key: string, size_bytes: string, storage_profile_id: string }>(`
      select asset.*, file.extension, file.mime_type, file.object_key,
             file.size_bytes, file.storage_profile_id
      from public.ds_prompt_assets asset
      join public.ds_prompts prompt on prompt.id = asset.prompt_id
      join public.file_objects file on file.id = asset.file_id
      where prompt.slug = $1 and prompt.status = 'published' and file.status = 'ready'
        and ($2::text is not null and asset.source_path = $2 or $2::text is null and asset.is_entrypoint = true)
      limit 1
    `, [slug, sourcePath ?? null])
    return result.rows[0] ?? null
  }

  async findAsset(promptId: string, assetId: string) {
    const result = await queryBusiness<PromptAsset>(`
      select * from public.ds_prompt_assets where prompt_id = $1::uuid and id = $2::uuid limit 1
    `, [promptId, assetId])
    return result.rows[0] ?? null
  }

  async removeAsset(promptId: string, assetId: string) {
    return withBusinessTransaction(async (client) => {
      const result = await client.query<Pick<PromptAsset, 'file_id' | 'id'>>(`
        delete from public.ds_prompt_assets where prompt_id = $1::uuid and id = $2::uuid
        returning id, file_id
      `, [promptId, assetId])
      if (result.rows[0]) {
        const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', promptId)
        await invalidateSecurityState(client, { id: promptId, type: 'prompt' }, snapshot.declaredFingerprint)
      }
      return result.rows[0] ?? null
    })
  }

  async sitemapRows() {
    const result = await queryBusiness<{ slug: string, updated_at: Date }>(`
      select slug, updated_at from public.ds_prompts
      where status = 'published' order by updated_at desc
    `)
    return result.rows
  }

  private async findDetail(condition: string, value: string, publishedOnly: boolean) {
    const result = await queryBusiness<PromptRow>(`
      select prompt.*, ${securityProjection(publishedOnly)}
      from public.ds_prompts prompt
      ${securityJoins('prompt', 'prompt')}
      where ${condition} limit 1
    `, [value])
    if (!result.rows[0])
      return null
    const hydrated = (await this.hydrate(result.rows))[0]!
    const [documents, assets] = await Promise.all([
      queryBusiness<PromptDocument>(`select * from public.ds_prompt_documents where prompt_id = $1::uuid order by sort, id`, [hydrated.id]),
      queryBusiness<PromptAsset>(`
        select asset.*, file.mime_type, file.size_bytes
        from public.ds_prompt_assets asset join public.file_objects file on file.id = asset.file_id
        where asset.prompt_id = $1::uuid ${publishedOnly ? `and file.status = 'ready'` : ''}
        order by asset.sort, asset.id
      `, [hydrated.id]),
    ])
    return { ...hydrated, assets: assets.rows, documents: documents.rows } satisfies PromptDetail
  }

  private async findByIdWithClient(client: PoolClient, id: string) {
    const result = await client.query<PromptRow>('select * from public.ds_prompts where id = $1::uuid limit 1', [id])
    if (!result.rows[0])
      return null
    const [links, documents, assets] = await Promise.all([
      client.query<PromptCategoryLinkRow>(`
        select category.*, link.prompt_id, link.is_primary, link.position
        from public.ds_prompt_category_links link join public.ds_prompt_categories category on category.id = link.category_id
        where link.prompt_id = $1::uuid order by link.position
      `, [id]),
      client.query<PromptDocument>('select * from public.ds_prompt_documents where prompt_id = $1::uuid order by sort, id', [id]),
      client.query<PromptAsset>('select asset.* from public.ds_prompt_assets asset where prompt_id = $1::uuid order by sort, id', [id]),
    ])
    return {
      ...result.rows[0],
      assets: assets.rows,
      categories: links.rows.map(stripLinkFields),
      cover_asset: assets.rows.find(asset => asset.is_primary) ?? assets.rows.find(asset => ['cover', 'image', 'video', 'web_preview'].includes(asset.role)) ?? null,
      documents: documents.rows,
      primary_category_id: links.rows.find(link => link.is_primary)?.id ?? '',
    } satisfies PromptDetail
  }

  private async hydrate(rows: PromptRow[]) {
    if (!rows.length)
      return []
    const ids = rows.map(row => row.id)
    const [links, assets] = await Promise.all([
      queryBusiness<PromptCategoryLinkRow>(`
        select category.*, link.prompt_id, link.is_primary, link.position
        from public.ds_prompt_category_links link join public.ds_prompt_categories category on category.id = link.category_id
        where link.prompt_id = any($1::uuid[]) order by link.position
      `, [ids]),
      queryBusiness<PromptAsset>(`
        select asset.*, file.mime_type, file.size_bytes
        from public.ds_prompt_assets asset join public.file_objects file on file.id = asset.file_id
        where asset.prompt_id = any($1::uuid[]) and file.status = 'ready'
          and (asset.is_primary or asset.role in ('cover', 'image', 'video', 'web_preview'))
        order by asset.is_primary desc, asset.sort, asset.id
      `, [ids]),
    ])
    return rows.map((row) => {
      const categories = links.rows.filter(link => link.prompt_id === row.id)
      const cover = assets.rows.find(asset => asset.prompt_id === row.id) ?? null
      return {
        ...row,
        categories: categories.map(stripLinkFields),
        cover_asset: cover,
        primary_category_id: categories.find(category => category.is_primary)?.id ?? '',
      } satisfies Prompt
    })
  }
}

export class PromptRepositoryError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'PROMPT_REPOSITORY_ERROR') {
    super(message)
  }
}

function assertTransition(current: PromptStatus, next: PromptStatus) {
  if (current === next)
    return
  const allowed: Record<PromptStatus, PromptStatus[]> = {
    archived: ['draft', 'published'],
    draft: ['published'],
    published: ['archived'],
  }
  if (!allowed[current].includes(next))
    throw new Error(`不能从 ${current} 直接变更为 ${next}`)
}

function buildFilters(filters: PromptFilters) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }
  if (filters.publishedOnly)
    conditions.push(`prompt.status = 'published'`)
  else if (filters.status)
    add(parameter => `prompt.status = ${parameter}`, filters.status)
  if (filters.q) {
    add(parameter => `(
      prompt.title ilike ${parameter}
      or prompt.summary ilike ${parameter}
      or exists (select 1 from unnest(prompt.tags) tag where tag ilike ${parameter})
      or exists (
        select 1 from public.ds_prompt_documents search_document
        where search_document.prompt_id = prompt.id
          and search_document.language = 'prompt-glossary+json'
          and search_document.content ilike ${parameter}
      )
    )`, `%${filters.q}%`)
  }
  if (filters.kind)
    add(parameter => `prompt.content_kind = ${parameter}`, filters.kind)
  if (filters.origin)
    add(parameter => `prompt.submission_origin = ${parameter}`, filters.origin)
  if (filters.featured !== null && filters.featured !== undefined)
    add(parameter => `prompt.featured = ${parameter}`, filters.featured)
  if (filters.category)
    add(parameter => `(filter_category.slug = ${parameter} or filter_category.id::text = ${parameter})`, filters.category)
  return { values, where: conditions.length ? `where ${conditions.join(' and ')}` : '' }
}

function communityDraftUnavailable() {
  return new PromptRepositoryError('投稿不存在、无权访问或已经完成', 404, 'PROMPT_COMMUNITY_DRAFT_UNAVAILABLE')
}

async function lockOwnedCommunityDraft(client: PoolClient, id: string, userId: string) {
  const result = await client.query<{ id: string }>(`
    select id from public.ds_prompts
    where id = $1::uuid and created_by = $2::uuid
      and status = 'draft' and submission_origin = 'community'
      and submitted_at is null
    for update
  `, [id, userId])
  if (!result.rows[0])
    throw communityDraftUnavailable()
  return result.rows[0]
}

async function replaceLinksAndDocuments(client: PoolClient, promptId: string, input: PromptSaveInput) {
  await client.query('delete from public.ds_prompt_category_links where prompt_id = $1::uuid', [promptId])
  for (const [position, categoryId] of input.categoryIds.entries()) {
    await client.query(`
      insert into public.ds_prompt_category_links (prompt_id, category_id, is_primary, position)
      values ($1::uuid, $2::uuid, $3, $4)
    `, [promptId, categoryId, categoryId === input.primaryCategoryId, position])
  }
  await client.query('delete from public.ds_prompt_documents where prompt_id = $1::uuid', [promptId])
  for (const [sort, document] of input.documents.entries()) {
    await client.query(`
      insert into public.ds_prompt_documents (
        prompt_id, source_path, name, role, language, content, sort, is_primary
      ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
    `, [promptId, document.sourcePath, document.name, document.role, document.language, document.content, sort, document.isPrimary])
  }
}

function stripLinkFields(row: PromptCategoryLinkRow): PromptCategory {
  const { is_primary: _primary, position: _position, prompt_id: _promptId, ...category } = row
  return category
}

async function syncEditorAssets(
  client: PoolClient,
  promptId: string,
  input: PromptSaveInput,
  actorId: string,
  origin: 'admin' | 'community',
) {
  const assets = input.assets ?? []
  const fileIds = assets.map(asset => asset.fileId)
  if (fileIds.length) {
    const files = await client.query<{ id: string }>(`
      select id from public.file_objects
      where id = any($1::uuid[]) and status = 'ready'
        and ($2 = 'admin' or owner_id = $3::uuid)
      for share
    `, [fileIds, origin, actorId])
    if (files.rows.length !== fileIds.length)
      throw new PromptRepositoryError('有素材不存在、尚未上传完成或无权使用', 409, 'PROMPT_ASSET_FILE_UNAVAILABLE')
  }

  await client.query(`
    delete from public.ds_prompt_assets
    where prompt_id = $1::uuid
      and origin in ('direct_upload', 'library_reference')
      and not (file_id = any($2::uuid[]))
  `, [promptId, fileIds])

  if (assets.some(asset => asset.isPrimary))
    await client.query(`update public.ds_prompt_assets set is_primary = false where prompt_id = $1::uuid`, [promptId])
  if (assets.some(asset => asset.isEntrypoint))
    await client.query(`update public.ds_prompt_assets set is_entrypoint = false where prompt_id = $1::uuid`, [promptId])

  for (const [sort, asset] of assets.entries()) {
    await client.query(`
      insert into public.ds_prompt_assets (
        prompt_id, file_id, source_path, name, role, origin, sort,
        is_primary, is_entrypoint, is_downloadable, alt_text
      ) values (
        $1::uuid, $2::uuid, $3, $4, $5, 'library_reference', $6,
        $7, $8, $9, $10
      )
      on conflict (prompt_id, file_id) do update set
        name = excluded.name, role = excluded.role, sort = excluded.sort,
        is_primary = excluded.is_primary, is_entrypoint = excluded.is_entrypoint,
        is_downloadable = excluded.is_downloadable, alt_text = excluded.alt_text,
        origin = 'library_reference'
    `, [
      promptId,
      asset.fileId,
      `library/${asset.fileId}`,
      asset.name,
      asset.role,
      sort,
      asset.isPrimary,
      asset.isEntrypoint,
      asset.isDownloadable,
      asset.altText ?? null,
    ])
  }
}

async function validateCategories(client: PoolClient, input: PromptSaveInput) {
  const result = await client.query<{ id: string, root_kind: PromptContentKind | 'general' }>(`
    with recursive category_roots as (
      select id, parent_id, kind as root_kind from public.ds_prompt_categories where id = any($1::uuid[])
      union all
      select roots.id, parent.parent_id, parent.kind
      from category_roots roots join public.ds_prompt_categories parent on parent.id = roots.parent_id
      where roots.parent_id is not null
    )
    select distinct on (id) id, root_kind from category_roots
    where parent_id is null order by id
  `, [input.categoryIds])
  if (result.rows.length !== input.categoryIds.length)
    throw new Error('所选分类不存在')
  const primary = result.rows.find(row => row.id === input.primaryCategoryId)
  if (!primary)
    throw new Error('主分类无效')
  if (primary.root_kind !== 'general' && primary.root_kind !== input.contentKind)
    throw new Error('内容类型必须与主分类一致')
}

export const promptRepository = new PromptRepository()

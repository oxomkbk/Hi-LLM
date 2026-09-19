import 'server-only'

import { deleteSecuritySubjectState, invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { securityJoins, securityProjection } from '@/lib/ai-security/public-projection'
import { evaluateAiContentPublishGate } from '@/lib/ai-security/publish-gate'
import { loadSecuritySubjectSnapshot } from '@/lib/ai-security/subject-repository'
import { buildMcpDeclaredSnapshot } from '@/lib/ai-security/subjects'
import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { hasMcpCanonicalConflict } from './mcp-canonical'

import type { Actor, PageResult } from './catalog'
import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { Mcp, McpSaveParams, McpStatus } from '@/types'

interface McpFilters {
  category?: string
  client?: string
  featured?: boolean | null
  limit: number
  offset: number
  publishedOnly?: boolean
  q?: string
  sortMode?: PublicCatalogSort
  status?: McpStatus | null
  transport?: string
}

export class McpRepository {
  async list(filters: McpFilters): Promise<PageResult<Mcp>> {
    const { values, where } = buildFilters(filters)
    const count = await queryBusiness<{ total: string }>(`
      select count(*)::text as total from public.ds_mcps mcp ${where}
    `, values)
    values.push(filters.limit, filters.offset)
    const result = await queryBusiness<Mcp>(`
      select mcp.*, ${securityProjection(filters.publishedOnly === true)}
      from public.ds_mcps mcp
      ${securityJoins('mcp', 'mcp')}
      ${where}
      order by ${filters.sortMode === 'latest'
        ? `${filters.publishedOnly ? 'mcp.published_at' : 'mcp.created_at'} desc, mcp.id desc`
        : `mcp.featured desc, mcp.verified desc, mcp.sort desc,
               ${filters.publishedOnly ? 'mcp.published_at' : 'mcp.created_at'} desc, mcp.id`}
      limit $${values.length - 1} offset $${values.length}
    `, values)
    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async findPublishedBySlug(slug: string) {
    const result = await queryBusiness<Mcp>(`
      select mcp.*, ${securityProjection(true)}
      from public.ds_mcps mcp
      ${securityJoins('mcp', 'mcp')}
      where mcp.slug = $1 and mcp.status = 'published' limit 1
    `, [slug])
    return result.rows[0] ?? null
  }

  async listRelated(mcp: Pick<Mcp, 'category' | 'id'>, limit = 3) {
    const result = await queryBusiness<Mcp>(`
      select mcp.*, ${securityProjection(true)}
      from public.ds_mcps mcp
      ${securityJoins('mcp', 'mcp')}
      where mcp.status = 'published' and mcp.category = $1 and mcp.id <> $2::uuid
      order by mcp.featured desc, mcp.sort desc, mcp.published_at desc, mcp.id
      limit $3
    `, [mcp.category, mcp.id, limit])
    return result.rows
  }

  async slugExists(candidate: string, options: { excludeMcpId?: string, excludeSubmissionId?: string } = {}) {
    const result = await queryBusiness<{ exists: boolean }>(`
      select exists (
        select 1 from public.ds_mcps
        where slug = $1 and ($2::uuid is null or id <> $2::uuid)
      ) or exists (
        select 1 from public.ds_mcp_submissions
        where slug = $1 and status = 'pending' and ($3::uuid is null or id <> $3::uuid)
      ) as exists
    `, [candidate, options.excludeMcpId ?? null, options.excludeSubmissionId ?? null])
    return result.rows[0]?.exists ?? false
  }

  async findById(id: string) {
    const result = await queryBusiness<Mcp>(`
      select * from public.ds_mcps where id = $1::uuid limit 1
    `, [id])
    return result.rows[0] ?? null
  }

  async create(input: McpSaveParams, actor: Actor) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      if (await hasMcpCanonicalConflict(client, input))
        throw new McpRepositoryError('该 MCP 已提交或已发布', 409)
      const requestedPublish = input.status === 'published'
      const stagedInput = requestedPublish ? { ...input, status: 'draft' as const } : input
      const result = await client.query<Mcp>(`
        insert into public.ds_mcps (
          slug, registry_name, name, summary, description, category, tags, capabilities,
          clients, language, protocol_version, installations, source_url, homepage_url,
          docs_url, publisher_name, publisher_url, version, license, icon, status,
          featured, verified, sort, published_by, published_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9::text[], $10,
          $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25::uuid, $26
        ) returning *
      `, mcpValues(stagedInput, null, null))
      const created = result.rows[0]!
      if (!requestedPublish)
        return created
      const snapshot = await loadSecuritySubjectSnapshot(client, 'mcp', created.id)
      await invalidateSecurityState(client, { id: created.id, type: 'mcp' }, snapshot.declaredFingerprint)
      const gate = await evaluateAiContentPublishGate(client, 'mcp', { id: created.id, type: 'mcp' }, snapshot.declaredFingerprint)
      const publication = await client.query<Mcp>(`
        update public.ds_mcps
        set status = case when $2 then 'published' else 'draft' end,
            published_by = case when $2 then $3::uuid else null end,
            published_at = case when $2 then now() else null end,
            publish_requested_at = case when $2 then null else now() end
        where id = $1::uuid returning *
      `, [created.id, gate.allowed, actor.id])
      return publication.rows[0]!
    })
  }

  async update(id: string, input: McpSaveParams, actor: Actor, current: Mcp, expectedUpdatedAt?: string) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      const locked = await client.query<Pick<Mcp, 'updated_at'>>(`select updated_at from public.ds_mcps where id = $1::uuid for update`, [id])
      if (!locked.rows[0])
        return null
      if (expectedUpdatedAt && new Date(locked.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())
        throw new McpRepositoryError('MCP 内容已被其他管理员修改，请刷新后重试', 409)
      if (await hasMcpCanonicalConflict(client, input, { mcpId: id }))
        throw new McpRepositoryError('该 MCP 已提交或已发布', 409)
      const declared = buildMcpSnapshot(input)
      const stagedPublish = input.status === 'published' && current.status !== 'published'
      if (input.status === 'published' && !stagedPublish) {
        const gate = await evaluateAiContentPublishGate(client, 'mcp', { id, type: 'mcp' }, declared.fingerprint)
        if (!gate.allowed)
          throw new McpRepositoryError(gate.message, 409)
      }
      const persistedInput = stagedPublish ? { ...input, status: 'draft' as const } : input
      const publishedAt = persistedInput.status === 'published' ? current.published_at ?? new Date().toISOString() : null
      const publishedBy = persistedInput.status === 'published' ? current.published_by ?? actor.id : null
      const values = mcpValues(persistedInput, publishedBy, publishedAt)
      const result = await client.query<Mcp>(`
        update public.ds_mcps set
          slug = $2, registry_name = $3, name = $4, summary = $5, description = $6,
          category = $7, tags = $8::text[], capabilities = $9::text[], clients = $10::text[],
          language = $11, protocol_version = $12, installations = $13::jsonb,
          source_url = $14, homepage_url = $15, docs_url = $16, publisher_name = $17,
          publisher_url = $18, version = $19, license = $20, icon = $21, status = $22,
          featured = $23, verified = $24, sort = $25, published_by = $26::uuid,
          published_at = $27
        where id = $1::uuid returning *
      `, [id, ...values])
      if (!result.rows[0])
        return null
      const snapshot = await loadSecuritySubjectSnapshot(client, 'mcp', id)
      await invalidateSecurityState(client, { id, type: 'mcp' }, snapshot.declaredFingerprint)
      if (!stagedPublish)
        return result.rows[0]
      const gate = await evaluateAiContentPublishGate(client, 'mcp', { id, type: 'mcp' }, snapshot.declaredFingerprint)
      const publication = await client.query<Mcp>(`
        update public.ds_mcps
        set status = case when $2 then 'published' else 'draft' end,
            published_by = case when $2 then $3::uuid else published_by end,
            published_at = case when $2 then coalesce(published_at, now()) else published_at end,
            publish_requested_at = case when $2 then null else now() end
        where id = $1::uuid returning *
      `, [id, gate.allowed, actor.id])
      return publication.rows[0]!
    })
  }

  async delete(id: string) {
    return withBusinessTransaction(async (client) => {
      await deleteSecuritySubjectState(client, { id, type: 'mcp' })
      const result = await client.query<Pick<Mcp, 'id' | 'slug'>>(`
        delete from public.ds_mcps where id = $1::uuid returning id, slug
      `, [id])
      return result.rows[0] ?? null
    })
  }

  async sitemapRows() {
    const result = await queryBusiness<{ slug: string, updated_at: Date }>(`
      select slug, updated_at from public.ds_mcps
      where status = 'published' order by updated_at desc
    `)
    return result.rows
  }
}

export class McpRepositoryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function buildFilters(filters: McpFilters) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }
  if (filters.publishedOnly)
    conditions.push(`mcp.status = 'published'`)
  else if (filters.status)
    add(parameter => `mcp.status = ${parameter}`, filters.status)
  if (filters.q)
    add(parameter => `(mcp.name ilike ${parameter} or mcp.summary ilike ${parameter} or mcp.publisher_name ilike ${parameter} or mcp.registry_name ilike ${parameter})`, `%${filters.q}%`)
  if (filters.category)
    add(parameter => `mcp.category = ${parameter}`, filters.category)
  if (filters.client)
    add(parameter => `mcp.clients @> array[${parameter}]::text[]`, filters.client)
  if (filters.transport)
    add(parameter => `mcp.installation_transports @> array[${parameter}]::text[]`, filters.transport)
  if (filters.featured !== null && filters.featured !== undefined)
    add(parameter => `mcp.featured = ${parameter}`, filters.featured)
  return { values, where: conditions.length ? `where ${conditions.join(' and ')}` : '' }
}

function buildMcpSnapshot(input: McpSaveParams) {
  return buildMcpDeclaredSnapshot({
    capabilities: input.capabilities,
    description: input.description,
    installations: input.installations.map(installation => ({
      args: installation.args,
      authType: installation.auth_type,
      command: installation.command,
      configTemplate: installation.config_template,
      envVars: installation.env_vars,
      headers: installation.headers,
      kind: installation.kind,
      packageName: installation.package,
      remoteUrl: installation.remote_url,
      transport: installation.transport,
      version: installation.version,
    })),
    name: input.name,
    protocolVersion: input.protocol_version,
    sourceUrl: input.source_url,
    summary: input.summary,
  })
}

function mcpValues(input: McpSaveParams, publishedBy: string | null, publishedAt: Date | string | null) {
  return [
    input.slug,
    input.registry_name,
    input.name,
    input.summary,
    input.description,
    input.category,
    input.tags,
    input.capabilities,
    input.clients,
    input.language,
    input.protocol_version,
    JSON.stringify(input.installations),
    input.source_url,
    input.homepage_url,
    input.docs_url,
    input.publisher_name,
    input.publisher_url,
    input.version,
    input.license,
    input.icon,
    input.status,
    input.featured,
    input.verified,
    input.sort,
    publishedBy,
    publishedAt,
  ]
}

export const mcpRepository = new McpRepository()

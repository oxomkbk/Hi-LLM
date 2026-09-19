import 'server-only'

import { deleteSecuritySubjectState, invalidateSecurityState } from '@/lib/ai-security/invalidation'
import { securityJoins, securityProjection } from '@/lib/ai-security/public-projection'
import { evaluateSkillPublishGate } from '@/lib/ai-security/publish-gate'
import { loadSecuritySubjectSnapshot } from '@/lib/ai-security/subject-repository'
import { buildSkillDeclaredSnapshot } from '@/lib/ai-security/subjects'
import { ensureBusinessUser, queryBusiness, withBusinessTransaction } from '@/lib/db/business'

import { hasSkillCanonicalConflict } from './skill-canonical'

import type { Actor, PageResult } from './catalog'
import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { Skill, SkillSaveParams, SkillStatus } from '@/types'

interface SkillFilters {
  category?: string
  featured?: boolean | null
  limit: number
  offset: number
  platform?: string
  publishedOnly?: boolean
  q?: string
  scenario?: string
  sortMode?: PublicCatalogSort
  status?: SkillStatus | null
}

export class SkillRepository {
  async list(filters: SkillFilters): Promise<PageResult<Skill>> {
    const { values, where } = buildSkillFilters(filters)
    const count = await queryBusiness<{ total: string }>(`
      select count(*)::text as total from public.ds_skills skill ${where}
    `, values)
    values.push(filters.limit, filters.offset)
    const result = await queryBusiness<Skill>(`
      select skill.*, ${securityProjection(filters.publishedOnly === true)}
      from public.ds_skills skill
      ${securityJoins('skill', 'skill')}
      ${where}
      order by ${filters.sortMode === 'latest'
        ? `${filters.publishedOnly ? 'skill.published_at' : 'skill.created_at'} desc, skill.id desc`
        : `skill.featured desc, skill.verified desc, skill.sort desc,
               ${filters.publishedOnly ? 'skill.published_at' : 'skill.created_at'} desc, skill.id`}
      limit $${values.length - 1} offset $${values.length}
    `, values)

    return { list: result.rows, total: Number(count.rows[0]?.total ?? 0) }
  }

  async findPublishedBySlug(slug: string) {
    const result = await queryBusiness<Skill>(`
      select skill.*, ${securityProjection(true)}
      from public.ds_skills skill
      ${securityJoins('skill', 'skill')}
      where skill.slug = $1 and skill.status = 'published' limit 1
    `, [slug])
    return result.rows[0] ?? null
  }

  async listRelated(skill: Pick<Skill, 'category' | 'id'>, limit = 4) {
    const result = await queryBusiness<Skill>(`
      select skill.*, ${securityProjection(true)}
      from public.ds_skills skill
      ${securityJoins('skill', 'skill')}
      where skill.status = 'published' and skill.category = $1 and skill.id <> $2::uuid
      order by skill.featured desc, skill.sort desc, skill.published_at desc, skill.id
      limit $3
    `, [skill.category, skill.id, limit])
    return result.rows
  }

  async slugExists(candidate: string, options: { excludeSkillId?: string, excludeSubmissionId?: string } = {}) {
    const result = await queryBusiness<{ exists: boolean }>(`
      select exists (
        select 1 from public.ds_skills
        where slug = $1 and ($2::uuid is null or id <> $2::uuid)
      ) or exists (
        select 1 from public.ds_skill_submissions
        where slug = $1 and status = 'pending' and ($3::uuid is null or id <> $3::uuid)
      ) as exists
    `, [candidate, options.excludeSkillId ?? null, options.excludeSubmissionId ?? null])
    return result.rows[0]?.exists ?? false
  }

  async findById(id: string) {
    const result = await queryBusiness<Skill>(`
      select * from public.ds_skills where id = $1::uuid limit 1
    `, [id])
    return result.rows[0] ?? null
  }

  async create(input: SkillSaveParams, actor: Actor) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      if (await hasSkillCanonicalConflict(client, input))
        throw new SkillRepositoryError('该 Skill 已提交或已发布', 409)
      const requestedPublish = input.status === 'published'
      const stagedInput = requestedPublish ? { ...input, status: 'draft' as const } : input
      const result = await client.query<Skill>(`
        insert into public.ds_skills (
          slug, name, summary, description, category, tags, platforms, source_kind, source_url,
          homepage_url, install_command, author_name, author_url, version, license,
          icon, status, featured, verified, sort, published_by, published_at
        ) values (
          $1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21::uuid, $22
        ) returning *
      `, skillValues(stagedInput, null, null))
      const created = result.rows[0]!
      if (!requestedPublish)
        return created
      const snapshot = await loadSecuritySubjectSnapshot(client, 'skill', created.id)
      await invalidateSecurityState(client, { id: created.id, type: 'skill' }, snapshot.declaredFingerprint)
      const gate = await evaluateSkillPublishGate(client, { id: created.id, type: 'skill' }, snapshot.declaredFingerprint)
      const publication = await client.query<Skill>(`
        update public.ds_skills
        set status = case when $2 then 'published' else 'draft' end,
            published_by = case when $2 then $3::uuid else null end,
            published_at = case when $2 then now() else null end,
            publish_requested_at = case when $2 then null else now() end
        where id = $1::uuid returning *
      `, [created.id, gate.allowed, actor.id])
      return publication.rows[0]!
    })
  }

  async update(id: string, input: SkillSaveParams, actor: Actor, current: Skill) {
    return withBusinessTransaction(async (client) => {
      await ensureBusinessUser(actor, client)
      if (await hasSkillCanonicalConflict(client, input, { skillId: id }))
        throw new SkillRepositoryError('该 Skill 已提交或已发布', 409)
      const declared = buildSkillDeclaredSnapshot({
        description: input.description,
        icon: input.icon,
        installCommand: input.install_command,
        name: input.name,
        platforms: input.platforms,
        sourceKind: input.source_kind,
        sourceUrl: input.source_url,
        summary: input.summary,
        version: input.version,
      })
      const stagedPublish = input.status === 'published' && current.status !== 'published'
      if (input.status === 'published' && !stagedPublish) {
        const gate = await evaluateSkillPublishGate(client, { id, type: 'skill' }, declared.fingerprint)
        if (!gate.allowed)
          throw new SkillRepositoryError(gate.message, 409)
      }
      const persistedInput = stagedPublish ? { ...input, status: 'draft' as const } : input
      const publishedAt = persistedInput.status === 'published' ? current.published_at ?? new Date().toISOString() : current.published_at
      const publishedBy = persistedInput.status === 'published' ? current.published_by ?? actor.id : current.published_by
      const values = skillValues(persistedInput, publishedBy, publishedAt)
      const result = await client.query<Skill>(`
        update public.ds_skills set
          slug = $2, name = $3, summary = $4, description = $5, category = $6,
          tags = $7::text[], platforms = $8::text[], source_kind = $9, source_url = $10,
          homepage_url = $11, install_command = $12, author_name = $13,
          author_url = $14, version = $15, license = $16, icon = $17,
          status = $18, featured = $19, verified = $20, sort = $21,
          published_by = $22::uuid, published_at = $23
        where id = $1::uuid returning *
      `, [id, ...values])
      if (!result.rows[0])
        return null
      const snapshot = await loadSecuritySubjectSnapshot(client, 'skill', id)
      await invalidateSecurityState(client, { id, type: 'skill' }, snapshot.declaredFingerprint)
      if (!stagedPublish)
        return result.rows[0]
      const gate = await evaluateSkillPublishGate(client, { id, type: 'skill' }, snapshot.declaredFingerprint)
      const publication = await client.query<Skill>(`
        update public.ds_skills
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
      await deleteSecuritySubjectState(client, { id, type: 'skill' })
      const result = await client.query<Pick<Skill, 'id'>>(`
        delete from public.ds_skills where id = $1::uuid returning id
      `, [id])
      return result.rows[0] ?? null
    })
  }

  async sitemapRows() {
    const result = await queryBusiness<{ slug: string, updated_at: Date }>(`
      select slug, updated_at from public.ds_skills
      where status = 'published' order by updated_at desc
    `)
    return result.rows
  }
}

export class SkillRepositoryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function buildSkillFilters(filters: SkillFilters) {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (condition: (parameter: string) => string, value: unknown) => {
    values.push(value)
    conditions.push(condition(`$${values.length}`))
  }

  if (filters.publishedOnly)
    conditions.push(`skill.status = 'published'`)
  else if (filters.status)
    add(parameter => `skill.status = ${parameter}`, filters.status)
  if (filters.q)
    add(parameter => `(skill.name ilike ${parameter} or skill.summary ilike ${parameter} or skill.author_name ilike ${parameter} or array_to_string(skill.tags, ' ') ilike ${parameter})`, `%${filters.q}%`)
  if (filters.category)
    add(parameter => `skill.category = ${parameter}`, filters.category)
  if (filters.platform)
    add(parameter => `skill.platforms @> array[${parameter}]::text[]`, filters.platform)
  if (filters.scenario)
    add(parameter => `skill.tags @> array[${parameter}]::text[]`, filters.scenario)
  if (filters.featured !== null && filters.featured !== undefined)
    add(parameter => `skill.featured = ${parameter}`, filters.featured)
  return {
    values,
    where: conditions.length ? `where ${conditions.join(' and ')}` : '',
  }
}

function skillValues(input: SkillSaveParams, publishedBy: string | null, publishedAt: Date | string | null) {
  return [
    input.slug,
    input.name,
    input.summary,
    input.description,
    input.category,
    input.tags,
    input.platforms,
    input.source_kind,
    input.source_url,
    input.homepage_url,
    input.install_command,
    input.author_name,
    input.author_url,
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

export const skillRepository = new SkillRepository()

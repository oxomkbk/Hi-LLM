import 'server-only'

import { AiSecurityError } from './errors'
import {
  buildMcpDeclaredSnapshot,
  buildPromptDeclaredSnapshot,
  buildSkillDeclaredSnapshot,
} from './subjects'

import type { SecuritySubjectType } from './domain'
import type { PoolClient } from 'pg'

export interface SecuritySubjectSnapshot {
  declaredFingerprint: string
  id: string
  name: string
  payload: unknown
  slug: string | null
  subjectType: SecuritySubjectType
}

interface McpInstallationRow {
  args?: string[]
  auth_type?: string
  command?: string | null
  config_template?: Record<string, unknown>
  env_vars?: Array<{ name?: string, required?: boolean }>
  headers?: Record<string, string>
  kind?: string
  package?: string | null
  remote_url?: string | null
  transport?: string
  version?: string | null
}

interface McpSubjectRow {
  capabilities: string[]
  description: string
  installations: McpInstallationRow[]
  name: string
  protocol_version: string
  slug: string
  source_url: string | null
  summary: string
}

interface PromptAssetRow {
  is_downloadable: boolean
  is_entrypoint: boolean
  role: string
  sha256: string | null
  source_path: string
}

interface PromptDocumentRow {
  content: string
  language: string
  role: string
  source_path: string
}

interface PromptSubjectRow {
  compatibility: string[]
  content_kind: string
  slug: string
  summary: string
  title: string
}

interface SkillSubjectRow {
  description: string
  icon: string | null
  install_command: string | null
  name: string
  platforms: string[]
  slug: string
  source_kind: 'external_page' | 'git_repository' | 'platform_content'
  source_url: string | null
  summary: string
  version: string | null
}

export async function loadSecuritySubjectSnapshot(
  client: PoolClient,
  subjectType: SecuritySubjectType,
  subjectId: string,
): Promise<SecuritySubjectSnapshot> {
  if (subjectType === 'skill' || subjectType === 'skill_submission')
    return loadSkillSnapshot(client, subjectType, subjectId)
  if (subjectType === 'mcp' || subjectType === 'mcp_submission')
    return loadMcpSnapshot(client, subjectType, subjectId)
  return loadPromptSnapshot(client, subjectId)
}

export async function lockSecuritySubjectRow(
  client: PoolClient,
  subjectType: SecuritySubjectType,
  subjectId: string,
) {
  const table = subjectTable(subjectType)
  const result = await client.query(`select id from public.${table} where id = $1::uuid for update`, [subjectId])
  if (!result.rowCount)
    throw new AiSecurityError('SECURITY_ASSESSMENT_NOT_FOUND', 'Security subject does not exist')
}

async function loadMcpSnapshot(client: PoolClient, subjectType: 'mcp' | 'mcp_submission', subjectId: string) {
  const table = subjectType === 'mcp' ? 'ds_mcps' : 'ds_mcp_submissions'
  const result = await client.query<McpSubjectRow>(`
    select slug, name, summary, description, capabilities, protocol_version,
           installations, source_url
    from public.${table}
    where id = $1::uuid
    limit 1
  `, [subjectId])
  const row = requireSubject(result.rows[0])
  const snapshot = buildMcpDeclaredSnapshot({
    capabilities: row.capabilities,
    description: row.description,
    installations: row.installations.map(normalizeMcpInstallation),
    name: row.name,
    protocolVersion: row.protocol_version,
    sourceUrl: row.source_url,
    summary: row.summary,
  })
  return {
    declaredFingerprint: snapshot.fingerprint,
    id: subjectId,
    name: row.name,
    payload: snapshot.payload,
    slug: row.slug,
    subjectType,
  }
}

async function loadPromptSnapshot(client: PoolClient, subjectId: string) {
  const promptResult = await client.query<PromptSubjectRow>(`
    select slug, title, summary, content_kind, compatibility
    from public.ds_prompts where id = $1::uuid limit 1
  `, [subjectId])
  const documentsResult = await client.query<PromptDocumentRow>(`
    select source_path, role, language, content
    from public.ds_prompt_documents
    where prompt_id = $1::uuid
    order by sort, id
  `, [subjectId])
  const assetsResult = await client.query<PromptAssetRow>(`
    select asset.source_path, asset.role, asset.is_entrypoint, asset.is_downloadable,
           file.sha256
    from public.ds_prompt_assets asset
    join public.file_objects file on file.id = asset.file_id
    where asset.prompt_id = $1::uuid
    order by asset.source_path, asset.id
  `, [subjectId])
  const prompt = requireSubject(promptResult.rows[0])
  const snapshot = buildPromptDeclaredSnapshot({
    assets: assetsResult.rows.map((asset) => {
      if (!asset.sha256)
        throw new AiSecurityError('SECURITY_INVALID_FINGERPRINT', `Prompt asset has no SHA-256: ${asset.source_path}`)
      return {
        downloadable: asset.is_downloadable,
        entrypoint: asset.is_entrypoint,
        path: asset.source_path,
        role: asset.role,
        sha256: asset.sha256,
      }
    }),
    compatibility: prompt.compatibility,
    contentKind: prompt.content_kind,
    documents: documentsResult.rows.map(document => ({
      content: document.content,
      language: document.language,
      path: document.source_path,
      role: document.role,
    })),
    summary: prompt.summary,
    title: prompt.title,
  })
  return {
    declaredFingerprint: snapshot.fingerprint,
    id: subjectId,
    name: prompt.title,
    payload: snapshot.payload,
    slug: prompt.slug,
    subjectType: 'prompt' as const,
  }
}

async function loadSkillSnapshot(client: PoolClient, subjectType: 'skill' | 'skill_submission', subjectId: string) {
  const table = subjectType === 'skill' ? 'ds_skills' : 'ds_skill_submissions'
  const result = await client.query<SkillSubjectRow>(`
    select slug, name, summary, description, platforms, source_kind, source_url,
           install_command, version, icon
    from public.${table}
    where id = $1::uuid
    limit 1
  `, [subjectId])
  const row = requireSubject(result.rows[0])
  const snapshot = buildSkillDeclaredSnapshot({
    description: row.description,
    icon: row.icon,
    installCommand: row.install_command,
    name: row.name,
    platforms: row.platforms,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    summary: row.summary,
    version: row.version,
  })
  return {
    declaredFingerprint: snapshot.fingerprint,
    id: subjectId,
    name: row.name,
    payload: snapshot.payload,
    slug: row.slug,
    subjectType,
  }
}

function normalizeMcpInstallation(input: McpInstallationRow) {
  return {
    args: input.args ?? [],
    authType: input.auth_type ?? 'none',
    command: input.command ?? null,
    configTemplate: input.config_template ?? {},
    envVars: (input.env_vars ?? []).map(variable => ({
      name: variable.name ?? '',
      required: variable.required === true,
    })),
    headers: input.headers ?? {},
    kind: input.kind ?? 'package',
    packageName: input.package ?? null,
    remoteUrl: input.remote_url ?? null,
    transport: input.transport ?? 'stdio',
    version: input.version ?? null,
  }
}

function requireSubject<T>(row: T | undefined): T {
  if (!row)
    throw new AiSecurityError('SECURITY_ASSESSMENT_NOT_FOUND', 'Security subject does not exist')
  return row
}

function subjectTable(subjectType: SecuritySubjectType) {
  return {
    mcp: 'ds_mcps',
    mcp_submission: 'ds_mcp_submissions',
    prompt: 'ds_prompts',
    skill: 'ds_skills',
    skill_submission: 'ds_skill_submissions',
  }[subjectType]
}

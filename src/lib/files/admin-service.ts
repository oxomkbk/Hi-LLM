import 'server-only'

import { queryBusiness } from '@/lib/db/business'
import { getControlPool } from '@/lib/db/control'
import { deleteFileObject } from '@/lib/files/service'
import { fileRepository } from '@/lib/repositories/files'

import type { FileStatus } from '@/lib/repositories/files'
import type { StorageProviderType } from '@/lib/runtime/types'

const FILE_STATUSES = new Set<FileStatus>([
  'pending',
  'quarantined',
  'ready',
  'failed',
  'deleting',
  'delete_failed',
  'deleted',
])

interface FileListRow {
  created_at: Date
  extension: string
  id: string
  mime_type: string
  original_name: string
  ready_at: Date | null
  reference_count: number
  size_bytes: string
  status: FileStatus
  storage_profile_id: string
  visibility: 'private' | 'public'
}

interface StorageProfileSummary {
  active: boolean
  id: string
  name: string
  provider: StorageProviderType
  status: 'archived' | 'selectable'
}

export class AdminFileError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'ADMIN_FILE_INVALID') {
    super(message)
  }
}

export async function deleteAdminFile(id: string, actorId: string) {
  const file = await fileRepository.findById(id)
  if (!file || file.status === 'deleted')
    throw new AdminFileError('文件不存在', 404, 'FILE_NOT_FOUND')
  if (file.status === 'deleting')
    throw new AdminFileError('文件正在删除，请稍后刷新', 409, 'FILE_DELETING')
  if (file.status === 'pending' || file.status === 'quarantined')
    throw new AdminFileError('文件仍在上传或校验中，暂时不能删除', 409, 'FILE_BUSY')

  const usages = await fileUsageLabels(id)
  if (usages.length) {
    const suffix = usages.length > 3 ? `${usages.length} 处内容` : usages.slice(0, 3).join('、')
    throw new AdminFileError(`文件正在被${suffix}使用，请先解除引用`, 409, 'FILE_IN_USE')
  }

  try {
    const deleted = await deleteFileObject(id)
    if (!deleted)
      throw new AdminFileError('文件状态已变化，请刷新后重试', 409, 'FILE_STATE_CHANGED')
    await writeFileAudit(actorId, id, true, 'FILE_DELETED')
    return { id }
  }
  catch (error) {
    await writeFileAudit(actorId, id, false, 'FILE_DELETE_FAILED').catch(() => undefined)
    throw error
  }
}

export async function listAdminFiles(input: {
  pageIndex: number
  pageSize: number
  provider?: StorageProviderType
  q?: string
  status?: FileStatus
}) {
  const profiles = await listStorageProfiles()
  const filters = [`file.status <> 'deleted'`]
  const values: unknown[] = []

  if (input.provider) {
    const profileIds = profiles
      .filter(profile => profile.provider === input.provider)
      .map(profile => profile.id)
    values.push(profileIds)
    filters.push(`file.storage_profile_id = any($${values.length}::uuid[])`)
  }
  if (input.status) {
    values.push(input.status)
    filters.push(`file.status = $${values.length}`)
  }
  if (input.q) {
    values.push(`%${escapeLike(input.q)}%`)
    filters.push(`file.original_name ilike $${values.length} escape '\\'`)
  }

  const where = `where ${filters.join(' and ')}`
  const listValues = [...values, input.pageSize, input.pageIndex * input.pageSize]
  const [count, files, totals] = await Promise.all([
    queryBusiness<{ total: string }>(`
      select count(*)::text as total
      from public.file_objects file
      ${where}
    `, values),
    queryBusiness<FileListRow>(`
      select
        file.id,
        file.original_name,
        file.size_bytes::text,
        file.mime_type,
        file.extension,
        file.visibility,
        file.status,
        file.storage_profile_id,
        file.created_at,
        file.ready_at,
        (
          (select count(*) from public.ds_websites website where website.logo_file_id = file.id)
          + (select count(*) from public.ds_website_submissions submission where submission.logo = 'file:' || file.id::text)
          + (select count(*) from public.ds_skills skill where skill.icon in ('file:' || file.id::text, '/api/files/' || file.id::text))
          + (select count(*) from public.ds_skill_submissions submission where submission.icon in ('file:' || file.id::text, '/api/files/' || file.id::text))
          + (select count(*) from public.ds_mcps mcp where mcp.icon in ('file:' || file.id::text, '/api/files/' || file.id::text))
          + (select count(*) from public.ds_mcp_submissions submission where submission.icon in ('file:' || file.id::text, '/api/files/' || file.id::text))
          + (select count(*) from public.ds_prompt_assets asset where asset.file_id = file.id)
          + (select count(*) from public.ds_ai_security_assessments assessment where assessment.raw_report_file_id = file.id)
          + (select count(*) from public.wonder_question_files link where link.file_id = file.id)
          + (select count(*) from public.wonder_answer_files link where link.file_id = file.id)
          + (select count(*) from public.wonder_news_files link where link.file_id = file.id)
          + (select count(*) from public.wonder_news_articles article where article.cover_file_id = file.id)
          + (select count(*) from public.wonder_work_files link where link.file_id = file.id)
          + (select count(*) from public.wonder_works work where work.cover_file_id = file.id)
          + (select count(*) from public.wonder_comment_files link where link.file_id = file.id)
          + (select count(*) from public.wonder_moderation_events event where event.file_id = file.id)
          + (select count(*) from public.wonder_editorial_seed_items item where item.cover_file_id = file.id)
          + (select count(*) from public.wonder_editorial_cover_switches receipt where receipt.old_cover_file_id = file.id or receipt.new_cover_file_id = file.id)
        )::int as reference_count
      from public.file_objects file
      ${where}
      order by file.created_at desc, file.id desc
      limit $${listValues.length - 1} offset $${listValues.length}
    `, listValues),
    queryBusiness<{ storage_profile_id: string, total: string }>(`
      select storage_profile_id, count(*)::text as total
      from public.file_objects
      where status <> 'deleted'
      group by storage_profile_id
    `),
  ])

  const profileMap = new Map(profiles.map(profile => [profile.id, profile]))
  const profileTotals = new Map(totals.rows.map(row => [row.storage_profile_id, Number(row.total)]))
  const providerTotals = {
    'all': 0,
    'local-filesystem': 0,
    'tencent-cos': 0,
  }
  for (const profile of profiles) {
    const total = profileTotals.get(profile.id) ?? 0
    providerTotals.all += total
    providerTotals[profile.provider] += total
  }

  return {
    list: files.rows.map((file) => {
      const profile = profileMap.get(file.storage_profile_id)
      return {
        ...file,
        reference_count: Number(file.reference_count),
        storage_profile: profile ?? {
          active: false,
          id: file.storage_profile_id,
          name: '配置已移除',
          provider: null,
          status: 'archived',
        },
        url: file.status === 'ready' ? `/api/files/${file.id}` : null,
      }
    }),
    page: input.pageIndex + 1,
    pageSize: input.pageSize,
    profiles,
    providerTotals,
    total: Number(count.rows[0]?.total ?? 0),
  }
}

export function parseAdminFileStatus(value: string | null) {
  if (!value)
    return undefined
  if (!FILE_STATUSES.has(value as FileStatus) || value === 'deleted')
    throw new AdminFileError('文件状态筛选无效')
  return value as FileStatus
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

async function fileUsageLabels(id: string) {
  const result = await queryBusiness<{ label: string }>(`
    select label from (
      select '网站“' || name || '”' as label from public.ds_websites where logo_file_id = $1::uuid
      union all
      select '网站投稿“' || name || '”' from public.ds_website_submissions where logo = 'file:' || $1::uuid::text
      union all
      select 'Skill“' || name || '”' from public.ds_skills where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
      union all
      select 'Skill 投稿“' || name || '”' from public.ds_skill_submissions where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
      union all
      select 'MCP“' || name || '”' from public.ds_mcps where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
      union all
      select 'MCP 投稿“' || name || '”' from public.ds_mcp_submissions where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
      union all
      select 'Prompt“' || prompt.title || '”' from public.ds_prompt_assets asset join public.ds_prompts prompt on prompt.id = asset.prompt_id where asset.file_id = $1::uuid
      union all
      select '安全评测报告' from public.ds_ai_security_assessments where raw_report_file_id = $1::uuid
      union all
      select '妙妙屋问题图片' from public.wonder_question_files where file_id = $1::uuid
      union all
      select '妙妙屋回答图片' from public.wonder_answer_files where file_id = $1::uuid
      union all
      select '妙妙屋新闻图片' from public.wonder_news_files where file_id = $1::uuid
      union all
      select '妙妙屋新闻封面' from public.wonder_news_articles where cover_file_id = $1::uuid
      union all
      select '作品广场正文图片' from public.wonder_work_files where file_id = $1::uuid
      union all
      select '作品广场封面' from public.wonder_works where cover_file_id = $1::uuid
      union all
      select '妙妙屋评论图片' from public.wonder_comment_files where file_id = $1::uuid
      union all
      select '妙妙屋审核记录' from public.wonder_moderation_events where file_id = $1::uuid
      union all
      select '作品种子封面' from public.wonder_editorial_seed_items where cover_file_id = $1::uuid
      union all
      select '作品封面切换记录' from public.wonder_editorial_cover_switches where old_cover_file_id = $1::uuid or new_cover_file_id = $1::uuid
    ) usage
  `, [id])
  return result.rows.map(row => row.label)
}

async function listStorageProfiles(): Promise<StorageProfileSummary[]> {
  const result = await getControlPool().query<{
    active: boolean
    id: string
    name: string
    provider: StorageProviderType
    status: 'archived' | 'selectable'
  }>(`
    select
      profile.id,
      profile.name,
      profile.provider,
      profile.status,
      (settings.default_storage_profile_id = profile.id) as active
    from control.storage_profiles profile
    cross join control.runtime_settings settings
    where settings.id = true
    order by active desc, profile.status, profile.created_at, profile.id
  `)
  return result.rows
}

async function writeFileAudit(actorId: string, id: string, success: boolean, code: string) {
  await getControlPool().query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values ($1, 'file.delete', 'file_object', $2, $3, $4, '{}'::jsonb)
  `, [actorId, id, success, code])
}

import 'server-only'

import { queryBusiness, withBusinessTransaction } from '@/lib/db/business'

export interface FileObjectRecord {
  created_at: Date
  crc64: string | null
  deleted_at: Date | null
  extension: string
  id: string
  mime_type: string
  object_key: string
  original_name: string
  owner_id: string | null
  ready_at: Date | null
  sha256: string | null
  size_bytes: string
  status: FileStatus
  storage_profile_id: string
  upload_session_id: string | null
  visibility: FileVisibility
}
export type FileStatus = 'deleted' | 'delete_failed' | 'deleting' | 'failed' | 'pending' | 'quarantined' | 'ready'

export type FileVisibility = 'private' | 'public'

export class FileRepository {
  async createPending(input: {
    extension: string
    id: string
    mimeType: string
    objectKey: string
    originalName: string
    ownerId?: string | null
    sizeBytes: number
    storageProfileId: string
    uploadSessionId?: string | null
    visibility: FileVisibility
  }) {
    const result = await queryBusiness<FileObjectRecord>(`
      insert into public.file_objects (
        id, upload_session_id, owner_id, storage_profile_id, object_key,
        original_name, size_bytes, mime_type, extension, visibility, status
      ) values (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
        $6, $7, $8, $9, $10, 'pending'
      ) returning *
    `, [
      input.id,
      input.uploadSessionId ?? null,
      input.ownerId ?? null,
      input.storageProfileId,
      input.objectKey,
      input.originalName,
      input.sizeBytes,
      input.mimeType,
      input.extension,
      input.visibility,
    ])
    return result.rows[0]!
  }

  async findById(id: string) {
    const result = await queryBusiness<FileObjectRecord>(`
      select * from public.file_objects where id = $1::uuid
    `, [id])
    return result.rows[0] ?? null
  }

  async isPublicContentReference(id: string) {
    const result = await queryBusiness<{ referenced: boolean }>(`
      select exists (
        select 1
        from public.ds_skills skill
        where skill.status = 'published'
          and skill.icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
        union all
        select 1
        from public.ds_mcps mcp
        where mcp.status = 'published'
          and mcp.icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
        union all
        select 1
        from public.ds_skills skill
        where skill.status = 'published'
          and skill.description like '%' || '/api/files/' || $1::uuid::text || '%'
        union all
        select 1
        from public.ds_mcps mcp
        where mcp.status = 'published'
          and mcp.description like '%' || '/api/files/' || $1::uuid::text || '%'
        union all
        select 1
        from public.ds_prompt_documents document
        join public.ds_prompts prompt on prompt.id = document.prompt_id
        where prompt.status = 'published'
          and document.content like '%' || '/api/files/' || $1::uuid::text || '%'
        union all
        select 1
        from public.wonder_question_files link
        join public.wonder_questions question on question.id = link.question_id
        where link.file_id = $1::uuid and question.visibility = 'visible'
        union all
        select 1
        from public.wonder_answer_files link
        join public.wonder_answers answer on answer.id = link.answer_id
        join public.wonder_questions question on question.id = answer.question_id
        where link.file_id = $1::uuid
          and answer.visibility = 'visible' and question.visibility = 'visible'
        union all
        select 1
        from public.wonder_news_articles article
        where article.cover_file_id = $1::uuid
          and article.status = 'published' and article.published_at <= now()
        union all
        select 1
        from public.wonder_news_files link
        join public.wonder_news_articles article on article.id = link.article_id
        where link.file_id = $1::uuid
          and article.status = 'published' and article.published_at <= now()
        union all
        select 1
        from public.wonder_works work
        where work.cover_file_id = $1::uuid and work.visibility = 'visible'
        union all
        select 1
        from public.wonder_work_files link
        join public.wonder_works work on work.id = link.work_id
        where link.file_id = $1::uuid and work.visibility = 'visible'
        union all
        select 1
        from public.wonder_comment_files link
        join public.wonder_comments comment on comment.id = link.comment_id
        left join public.wonder_questions question on question.id = comment.question_id
        left join public.wonder_answers answer on answer.id = comment.answer_id
        left join public.wonder_news_articles news on news.id = comment.news_id
        where link.file_id = $1::uuid and comment.visibility = 'visible'
          and (
            (comment.news_id is not null and news.status = 'published' and news.published_at <= now())
            or (
              comment.question_id is not null and question.visibility = 'visible'
              and (comment.answer_id is null or answer.visibility = 'visible')
            )
          )
      ) as referenced
    `, [id])
    return result.rows[0]?.referenced === true
  }

  async markReady(id: string, input: { crc64?: string, sha256?: string, sizeBytes: number }) {
    const result = await queryBusiness<FileObjectRecord>(`
      update public.file_objects
      set size_bytes = $2, crc64 = $3, sha256 = $4,
          status = 'ready', ready_at = now()
      where id = $1::uuid and status in ('pending', 'quarantined')
      returning *
    `, [id, input.sizeBytes, input.crc64 ?? null, input.sha256 ?? null])
    return result.rows[0] ?? null
  }

  async markFailed(id: string) {
    await queryBusiness(`
      update public.file_objects set status = 'failed'
      where id = $1::uuid and status in ('pending', 'quarantined')
    `, [id])
  }

  async markDeleting(id: string) {
    return withBusinessTransaction(async (client) => {
      const locked = await client.query<FileObjectRecord>(`
        select * from public.file_objects
        where id = $1::uuid and status not in ('deleted', 'deleting')
        for update
      `, [id])
      if (!locked.rows[0])
        return null
      const usage = await client.query<{ referenced: boolean }>(`
        select exists (
          select 1 from public.ds_websites where logo_file_id = $1::uuid
          union all select 1 from public.ds_website_submissions where logo in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
          union all select 1 from public.ds_skills where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
          union all select 1 from public.ds_skill_submissions where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
          union all select 1 from public.ds_mcps where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
          union all select 1 from public.ds_mcp_submissions where icon in ('file:' || $1::uuid::text, '/api/files/' || $1::uuid::text)
          union all select 1 from public.ds_prompt_assets where file_id = $1::uuid
          union all select 1 from public.ds_skills where description like '%' || '/api/files/' || $1::uuid::text || '%'
          union all select 1 from public.ds_skill_submissions where description like '%' || '/api/files/' || $1::uuid::text || '%'
          union all select 1 from public.ds_mcps where description like '%' || '/api/files/' || $1::uuid::text || '%'
          union all select 1 from public.ds_mcp_submissions where description like '%' || '/api/files/' || $1::uuid::text || '%'
          union all select 1 from public.ds_prompt_documents where content like '%' || '/api/files/' || $1::uuid::text || '%'
          union all select 1 from public.ds_ai_security_assessments where raw_report_file_id = $1::uuid
          union all select 1 from public.wonder_question_files where file_id = $1::uuid
          union all select 1 from public.wonder_answer_files where file_id = $1::uuid
          union all select 1 from public.wonder_news_files where file_id = $1::uuid
          union all select 1 from public.wonder_news_articles where cover_file_id = $1::uuid
          union all select 1 from public.wonder_work_files where file_id = $1::uuid
          union all select 1 from public.wonder_works where cover_file_id = $1::uuid
          union all select 1 from public.wonder_comment_files where file_id = $1::uuid
          union all select 1 from public.wonder_moderation_events where file_id = $1::uuid
          union all select 1 from public.wonder_editorial_seed_items where cover_file_id = $1::uuid
          union all select 1 from public.wonder_editorial_cover_switches where old_cover_file_id = $1::uuid or new_cover_file_id = $1::uuid
        ) as referenced
      `, [id])
      if (usage.rows[0]?.referenced)
        return null
      const result = await client.query<FileObjectRecord>(`
        update public.file_objects set status = 'deleting'
        where id = $1::uuid and status not in ('deleted', 'deleting')
        returning *
      `, [id])
      return result.rows[0] ?? null
    })
  }

  async markDeleted(id: string) {
    await queryBusiness(`
      update public.file_objects
      set status = 'deleted', deleted_at = now()
      where id = $1::uuid
    `, [id])
  }

  async markDeleteFailed(id: string) {
    await queryBusiness(`
      update public.file_objects set status = 'delete_failed'
      where id = $1::uuid
    `, [id])
  }
}

export const fileRepository = new FileRepository()

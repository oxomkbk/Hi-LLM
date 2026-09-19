import 'server-only'

import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { ensureBusinessUser, queryBusiness } from '@/lib/db/business'
import { getControlPool } from '@/lib/db/control'
import { createPromptSlug, sanitizePromptAdminInput } from '@/lib/prompts'
import { extractPromptAssets, parsePromptPackage } from '@/lib/prompts/package-parser'
import { fileRepository } from '@/lib/repositories/files'
import { promptRepository } from '@/lib/repositories/prompts'
import { getRuntimeSnapshot } from '@/lib/runtime/config'
import { getStorageProviderByProfileId } from '@/lib/storage'

import type { ParsedPromptEntry } from '@/lib/prompts/package-parser'
import type { Actor } from '@/lib/repositories/catalog'
import type { FileObjectRecord } from '@/lib/repositories/files'
import type { PromptImport, PromptImportReport, PromptSaveInput } from '@/types'

interface ImportRow {
  created_at: Date
  error_code: string | null
  error_message: string | null
  expires_at: Date
  id: string
  prompt_id: string | null
  report: PromptImportReport
  source_file_id: string
  status: PromptImport['status']
  updated_at: Date
}

export class PromptImportError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'PROMPT_IMPORT_INVALID') {
    super(message)
  }
}

export async function commitPromptImport(id: string, actor: Actor, overrides: Record<string, unknown> = {}) {
  const locked = await getControlPool().query<ImportRow>(`
    update control.prompt_imports set status = 'committing'
    where id = $1::uuid and actor_id = $2 and status = 'parsed' and expires_at > now()
    returning *
  `, [id, actor.id])
  const importRow = locked.rows[0]
  if (!importRow)
    throw new PromptImportError('导入任务不存在、已过期或状态已变化', 409, 'PROMPT_IMPORT_STATE_CHANGED')
  if (importRow.report.blocking.length) {
    await restoreParsed(id)
    throw new PromptImportError('请先解决解析报告中的阻塞问题', 409, 'PROMPT_IMPORT_HAS_BLOCKERS')
  }

  const snapshot = await getRuntimeSnapshot({ fresh: true })
  const controlDetails = await getControlPool().query<{
    database_profile_id: string
    source_file_id: string
    storage_profile_id: string
  }>('select database_profile_id, storage_profile_id, source_file_id from control.prompt_imports where id = $1::uuid', [id])
  const details = controlDetails.rows[0]!
  if (snapshot.database.id !== details.database_profile_id || snapshot.storage.id !== details.storage_profile_id) {
    await restoreParsed(id)
    throw new PromptImportError('基础设施配置已切换，请重新发起导入', 409, 'PROMPT_IMPORT_PROFILE_CHANGED')
  }

  const source = await fileRepository.findById(details.source_file_id)
  if (!source || source.status !== 'ready') {
    await failImport(id, 'PROMPT_SOURCE_MISSING', '源压缩包不存在')
    throw new PromptImportError('源压缩包不存在', 404, 'PROMPT_SOURCE_MISSING')
  }

  const temp = await mkdtemp(path.join(tmpdir(), 'hillm-nav-prompt-commit-'))
  let promptId: string | null = null
  const extractedFiles: FileObjectRecord[] = []
  try {
    const zipPath = path.join(temp, 'source.zip')
    const provider = await getStorageProviderByProfileId(details.storage_profile_id)
    await pipeline(await provider.createReadStream({ key: source.object_key }), createWriteStream(zipPath, { flags: 'wx' }))
    const parsed = await parsePromptPackage(zipPath)
    if (parsed.report.blocking.length || !parsed.report.metadata || !parsed.report.primaryPromptPath)
      throw new PromptImportError('压缩包复检未通过，请重新上传', 409, 'PROMPT_IMPORT_RECHECK_FAILED')

    const input = await buildSaveInput(parsed.entries, parsed.report, overrides)
    const prompt = await promptRepository.create(input, actor)
    promptId = prompt.id
    await queryBusiness('update public.ds_prompts set source_import_id = $2::uuid where id = $1::uuid', [prompt.id, id])
    await promptRepository.attachAsset(prompt.id, {
      fileId: source.id,
      importId: id,
      isDownloadable: true,
      name: source.original_name,
      origin: 'package_source',
      role: 'source_package',
      sourcePath: `__package__/${source.original_name}`,
    })

    const extracted = await extractPromptAssets(zipPath, parsed.entries, path.join(temp, 'assets'))
    let hasPrimary = false
    for (const entry of extracted) {
      const stored = await storeExtractedFile(entry, actor, details.storage_profile_id)
      extractedFiles.push(stored)
      const isPrimary = !hasPrimary && ['cover', 'image', 'video', 'web_preview'].includes(String(entry.role))
      if (isPrimary)
        hasPrimary = true
      await promptRepository.attachAsset(prompt.id, {
        fileId: stored.id,
        importId: id,
        isDownloadable: entry.role === 'attachment',
        isEntrypoint: entry.role === 'web_preview' && /(?:^|\/)(?:index|preview)\.html?$/i.test(entry.path),
        isPrimary,
        name: path.basename(entry.path),
        origin: 'package_extracted',
        role: entry.role as Parameters<typeof promptRepository.attachAsset>[1]['role'],
        sourcePath: entry.path,
      })
    }
    await queryBusiness(`
      update public.ds_prompts set preview_status = case
        when exists (select 1 from public.ds_prompt_assets where prompt_id = $1::uuid and role = 'web_preview' and is_entrypoint) then 'ready'
        else 'none' end
      where id = $1::uuid
    `, [prompt.id])
    const updated = await getControlPool().query<ImportRow>(`
      update control.prompt_imports set status = 'committed', prompt_id = $2::uuid,
        staged_file_ids = $3::uuid[] where id = $1::uuid returning *
    `, [id, prompt.id, extractedFiles.map(file => file.id)])
    return { import: mapImport(updated.rows[0]!), prompt: await promptRepository.findById(prompt.id) }
  }
  catch (error) {
    if (promptId)
      await promptRepository.delete(promptId).catch(() => undefined)
    for (const file of extractedFiles)
      await deleteStoredFile(file).catch(() => undefined)
    const message = error instanceof Error ? error.message : '创建草稿失败'
    await failImport(id, 'PROMPT_IMPORT_COMMIT_FAILED', message)
    throw error
  }
  finally {
    await rm(temp, { force: true, recursive: true })
  }
}

export async function createPromptImport(sourceFileId: string, actor: Actor) {
  const source = await assertImportSource(sourceFileId, actor.id)
  const snapshot = await getRuntimeSnapshot({ fresh: true })
  if (snapshot.database.id !== source.database_profile_id || snapshot.storage.id !== source.storage_profile_id)
    throw new PromptImportError('上传后基础设施配置已切换，请重新上传压缩包', 409, 'PROMPT_IMPORT_PROFILE_CHANGED')

  const inserted = await getControlPool().query<ImportRow>(`
    insert into control.prompt_imports (
      source_file_id, actor_id, database_profile_id, storage_profile_id, status
    ) values ($1::uuid, $2, $3::uuid, $4::uuid, 'parsing') returning *
  `, [sourceFileId, actor.id, source.database_profile_id, source.storage_profile_id])
  const row = inserted.rows[0]!
  const temp = await mkdtemp(path.join(tmpdir(), 'hillm-nav-prompt-import-'))
  try {
    const zipPath = path.join(temp, 'source.zip')
    const provider = await getStorageProviderByProfileId(source.storage_profile_id)
    await pipeline(await provider.createReadStream({ key: source.object_key }), createWriteStream(zipPath, { flags: 'wx' }))
    const parsed = await parsePromptPackage(zipPath)
    const updated = await getControlPool().query<ImportRow>(`
      update control.prompt_imports set status = 'parsed', report = $2::jsonb
      where id = $1::uuid and status = 'parsing' returning *
    `, [row.id, JSON.stringify(parsed.report)])
    return mapImport(updated.rows[0]!)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '压缩包解析失败'
    await getControlPool().query(`
      update control.prompt_imports set status = 'failed', error_code = 'PROMPT_PACKAGE_INVALID', error_message = $2
      where id = $1::uuid
    `, [row.id, message.slice(0, 1000)])
    throw new PromptImportError(message, 400, 'PROMPT_PACKAGE_INVALID')
  }
  finally {
    await rm(temp, { force: true, recursive: true })
  }
}

export async function getPromptImport(id: string, actorId: string) {
  const result = await getControlPool().query<ImportRow>(`
    select * from control.prompt_imports where id = $1::uuid and actor_id = $2 limit 1
  `, [id, actorId])
  return result.rows[0] ? mapImport(result.rows[0]) : null
}

async function assertImportSource(fileId: string, actorId: string) {
  const result = await getControlPool().query<{
    database_profile_id: string
    object_key: string
    scope: string
    status: string
    storage_profile_id: string
  }>(`
    select database_profile_id, storage_profile_id, object_key, scope, status
    from control.upload_sessions
    where file_object_id = $1::uuid and user_id = $2 limit 1
  `, [fileId, actorId])
  const session = result.rows[0]
  if (!session || session.scope !== 'prompt-package' || session.status !== 'completed')
    throw new PromptImportError('请选择已完成上传的 Prompts ZIP 包', 400, 'PROMPT_SOURCE_INVALID')
  const file = await fileRepository.findById(fileId)
  if (!file || file.status !== 'ready' || file.extension !== 'zip')
    throw new PromptImportError('ZIP 源文件不可用', 400, 'PROMPT_SOURCE_INVALID')
  return session
}

async function buildSaveInput(entries: ParsedPromptEntry[], report: PromptImportReport, overrides: Record<string, unknown>): Promise<PromptSaveInput> {
  const metadata = report.metadata!
  const categories = await queryBusiness<{ id: string, slug: string }>(`
    select id, slug from public.ds_prompt_categories where active = true and slug = any($1::text[])
  `, [metadata.categories])
  const categoryIds = Array.isArray(overrides.categoryIds) ? overrides.categoryIds : categories.rows.map(row => row.id)
  const primarySlug = metadata.primaryCategory ?? metadata.categories[0]
  const defaultPrimary = categories.rows.find(row => row.slug === primarySlug)?.id
  const primaryCategoryId = typeof overrides.primaryCategoryId === 'string' ? overrides.primaryCategoryId : defaultPrimary
  const documents = entries.filter(entry => entry.kind === 'document' && entry.content !== undefined).map(entry => ({
    content: entry.content!,
    isPrimary: entry.path === report.primaryPromptPath,
    language: entry.language,
    name: path.basename(entry.path),
    role: entry.role,
    sourcePath: entry.path,
  }))
  return sanitizePromptAdminInput({
    categoryIds,
    compatibility: overrides.compatibility ?? metadata.compatibility,
    contentKind: overrides.contentKind ?? metadata.contentKind,
    documents,
    featured: false,
    primaryCategoryId,
    slug: createPromptSlug(overrides.slug ?? metadata.slug),
    sort: 1,
    status: 'draft',
    summary: overrides.summary ?? metadata.summary,
    tags: overrides.tags ?? metadata.tags,
    title: overrides.title ?? metadata.title,
  })
}

async function deleteStoredFile(file: FileObjectRecord) {
  const provider = await getStorageProviderByProfileId(file.storage_profile_id)
  await fileRepository.markDeleting(file.id)
  await provider.deleteObject(file.object_key)
  await fileRepository.markDeleted(file.id)
}

async function failImport(id: string, code: string, message: string) {
  await getControlPool().query(`
    update control.prompt_imports set status = 'failed', error_code = $2, error_message = $3
    where id = $1::uuid
  `, [id, code, message.slice(0, 1000)])
}

function mapImport(row: ImportRow): PromptImport {
  return {
    createdAt: row.created_at.toISOString(),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    expiresAt: row.expires_at.toISOString(),
    id: row.id,
    promptId: row.prompt_id,
    report: row.report,
    sourceFileId: row.source_file_id,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  }
}

function mimeFromExtension(extension: string) {
  const types: Record<string, string> = {
    css: 'text/css',
    gif: 'image/gif',
    htm: 'text/html',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'text/javascript',
    json: 'application/json',
    mov: 'video/quicktime',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    webm: 'video/webm',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
  }
  return types[extension] ?? 'application/octet-stream'
}

async function restoreParsed(id: string) {
  await getControlPool().query(`update control.prompt_imports set status = 'parsed' where id = $1::uuid and status = 'committing'`, [id])
}

async function storeExtractedFile(entry: ParsedPromptEntry & { filePath: string }, actor: Actor, storageProfileId: string) {
  const info = await stat(entry.filePath)
  const id = randomUUID()
  const extension = entry.extension || 'bin'
  const objectKey = `prompt-derived/${new Date().toISOString().slice(0, 7).replace('-', '/')}/${id}.${extension}`
  const mimeType = mimeFromExtension(extension)
  await ensureBusinessUser(actor)
  const file = await fileRepository.createPending({
    extension,
    id,
    mimeType,
    objectKey,
    originalName: path.basename(entry.path),
    ownerId: actor.id,
    sizeBytes: info.size,
    storageProfileId,
    visibility: 'private',
  })
  try {
    const provider = await getStorageProviderByProfileId(storageProfileId)
    const stored = await provider.putObject({ body: createReadStream(entry.filePath), contentLength: info.size, contentType: mimeType, key: objectKey })
    return (await fileRepository.markReady(id, { sha256: stored.sha256, sizeBytes: stored.size })) ?? file
  }
  catch (error) {
    await fileRepository.markFailed(id)
    throw error
  }
}

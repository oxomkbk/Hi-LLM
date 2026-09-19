import 'server-only'

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Readable } from 'node:stream'

import { ensureBusinessUser } from '@/lib/db/business'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { fileRepository } from '@/lib/repositories/files'
import { getRuntimeSnapshot } from '@/lib/runtime/config'
import { getStorageProvider, getStorageProviderByProfileId } from '@/lib/storage'
import { StorageNotFoundError } from '@/lib/storage/types'

import type { Actor } from '@/lib/repositories/catalog'
import type { FileVisibility } from '@/lib/repositories/files'
import type { Buffer } from 'node:buffer'

export const FILE_TOKEN_PREFIX = 'file:'

export async function completeSmallFileUpload(sessionId: string) {
  await getControlPool().query(`
    update control.upload_sessions
    set status = 'completed', completed_at = now()
    where id = $1::uuid and status = 'uploading'
  `, [sessionId])
}

export async function deleteFileObject(id: string) {
  const file = await fileRepository.markDeleting(id)
  if (!file)
    return false
  return deleteMarkedFileObject(id)
}

export async function deleteMarkedFileObject(id: string) {
  const file = await fileRepository.findById(id)
  if (!file || file.status !== 'deleting')
    return false
  try {
    const provider = await getStorageProviderByProfileId(file.storage_profile_id)
    await provider.deleteObject(file.object_key).catch((error) => {
      if (!(error instanceof StorageNotFoundError))
        throw error
    })
    await fileRepository.markDeleted(id)
    return true
  }
  catch (error) {
    await fileRepository.markDeleteFailed(id).catch(() => undefined)
    throw error
  }
}

export async function failSmallFileUpload(sessionId: string) {
  await getControlPool().query(`
    update control.upload_sessions set status = 'failed'
    where id = $1::uuid and status in ('creating', 'uploading')
  `, [sessionId])
}

export function fileToken(id: string) {
  return `${FILE_TOKEN_PREFIX}${id}`
}

export function parseFileToken(value: string | null | undefined) {
  if (!value?.startsWith(FILE_TOKEN_PREFIX))
    return null
  const id = value.slice(FILE_TOKEN_PREFIX.length)
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export function sanitizeFilename(originalName: string, fallbackExtension: string) {
  const base = path.basename(originalName || `file.${fallbackExtension}`)
  const cleaned = Array.from(base)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 31 && code !== 127 && character !== '"' && character !== '\\'
    })
    .join('')
    .trim()
  return (cleaned || `file.${fallbackExtension}`).slice(0, 180)
}

export async function storeSmallFile(input: {
  actor?: Actor | null
  body: Buffer
  extension: string
  mimeType: string
  originalName: string
  ownerId?: string | null
  scope: string
  visibility: FileVisibility
}) {
  if (!input.body.length || input.body.length > 16 * 1024 * 1024)
    throw new Error('小文件上传大小无效')

  const id = randomUUID()
  const uploadSessionId = randomUUID()
  const extension = normalizeExtension(input.extension)
  const scope = normalizeScope(input.scope)
  const date = new Date()
  const objectKey = [
    scope,
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    `${id}.${extension}`,
  ].join('/')
  const pinned = await beginSmallFileUpload({
    fileObjectId: id,
    mimeType: input.mimeType,
    objectKey,
    originalName: sanitizeFilename(input.originalName, extension),
    scope,
    sessionId: uploadSessionId,
    size: input.body.length,
    userId: input.ownerId ?? input.actor?.id ?? `anonymous:${uploadSessionId}`,
  })
  const snapshot = await getRuntimeSnapshot({ fresh: true })
  if (snapshot.database.id !== pinned.databaseProfileId || snapshot.storage.id !== pinned.storageProfileId) {
    await failSmallFileUpload(uploadSessionId)
    throw new Error('基础设施配置已变化，请重新上传')
  }
  const provider = getStorageProvider(snapshot.storage)

  try {
    if (input.actor)
      await ensureBusinessUser(input.actor)
    await fileRepository.createPending({
      extension,
      id,
      mimeType: input.mimeType,
      objectKey,
      originalName: sanitizeFilename(input.originalName, extension),
      ownerId: input.ownerId ?? input.actor?.id ?? null,
      sizeBytes: input.body.length,
      storageProfileId: snapshot.storage.id,
      uploadSessionId,
      visibility: input.visibility,
    })
    const stored = await provider.putObject({
      body: Readable.from(input.body),
      contentLength: input.body.length,
      contentType: input.mimeType,
      key: objectKey,
    })
    const ready = await fileRepository.markReady(id, {
      sha256: stored.sha256,
      sizeBytes: stored.size,
    })
    if (!ready)
      throw new Error('文件状态更新失败')
    return { ...ready, infrastructureUploadSessionId: uploadSessionId }
  }
  catch (error) {
    await provider.deleteObject(objectKey).catch(() => undefined)
    await fileRepository.markFailed(id).catch(() => undefined)
    await failSmallFileUpload(uploadSessionId).catch(() => undefined)
    throw error
  }
}

async function beginSmallFileUpload(input: {
  fileObjectId: string
  mimeType: string
  objectKey: string
  originalName: string
  scope: string
  sessionId: string
  size: number
  userId: string
}) {
  return withControlTransaction(async (client) => {
    const settings = await client.query<{
      active_database_profile_id: string | null
      default_storage_profile_id: string | null
    }>(`
      select active_database_profile_id, default_storage_profile_id
      from control.runtime_settings where id = true for share
    `)
    const current = settings.rows[0]
    if (!current?.active_database_profile_id || !current.default_storage_profile_id)
      throw new Error('基础设施配置尚未初始化')
    await client.query(`
      insert into control.upload_sessions (
        id, file_object_id, user_id, database_profile_id, storage_profile_id,
        object_key, scope, original_name, declared_mime_type, total_size_bytes,
        reserved_bytes, part_size_bytes, part_count, status, expires_at
      ) values (
        $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
        $6, $7, $8, $9, $10,
        $10, $10, 1, 'uploading', now() + interval '10 minutes'
      )
    `, [
      input.sessionId,
      input.fileObjectId,
      input.userId,
      current.active_database_profile_id,
      current.default_storage_profile_id,
      input.objectKey,
      input.scope,
      input.originalName,
      input.mimeType,
      input.size,
    ])
    return {
      databaseProfileId: current.active_database_profile_id,
      storageProfileId: current.default_storage_profile_id,
    }
  })
}

function normalizeExtension(extension: string) {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  if (!/^[a-z0-9]{1,12}$/.test(normalized))
    throw new Error('文件扩展名无效')
  return normalized
}

function normalizeScope(scope: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(scope))
    throw new Error('上传用途无效')
  return scope
}

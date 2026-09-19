import 'server-only'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { requireAccountActive, requireAccountCapability } from '@/lib/auth/capabilities'
import { createPendingAvatar, findAvatarById, markAvatarFailed, markAvatarReady } from '@/lib/avatars/repository'
import { ensureBusinessUser } from '@/lib/db/business'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { normalizeProfileBackgroundObject } from '@/lib/profile-backgrounds/image'
import {
  createPendingProfileBackground,
  findProfileBackgroundById,
  markProfileBackgroundFailed,
  markProfileBackgroundNormalized,
  markProfileBackgroundReady,
} from '@/lib/profile-backgrounds/repository'
import { fileRepository } from '@/lib/repositories/files'
import { getRuntimeSnapshot } from '@/lib/runtime/config'
import { getStorageProviderByProfileId } from '@/lib/storage'
import { StorageNotFoundError } from '@/lib/storage/types'

import { sanitizeFilename } from '../files/service'
import { detectImageMimeType } from './image-signature'
import { listCompleteParts, validateCompleteParts } from './parts'
import { assertUploadScope } from './scope'

import type { Actor } from '@/lib/repositories/catalog'
import type { FileVisibility } from '@/lib/repositories/files'
import type { StoragePart } from '@/lib/storage/types'
import type { AdminUserRole } from '@/types'
import type { PoolClient } from 'pg'

const ACTIVE_STATUSES = ['creating', 'uploading', 'verifying', 'cancelling'] as const

export interface UploadSessionRecord {
  completed_at: Date | null
  created_at: Date
  database_profile_id: string
  declared_mime_type: string
  expires_at: Date
  file_object_id: string
  id: string
  object_key: string
  original_name: string
  part_count: number
  part_size_bytes: string
  parts: StoragePart[]
  provider_upload_id: string | null
  reserved_bytes: string
  scope: string
  status: 'cancelled' | 'cancelling' | 'completed' | 'creating' | 'expired' | 'failed' | 'uploading' | 'verifying'
  storage_profile_id: string
  total_size_bytes: string
  updated_at: Date
  user_id: string
}

interface UploadPolicy {
  allowed_extensions: string[]
  allowed_mime_types: string[]
  daily_quota_bytes: string
  max_active_sessions: number
  max_concurrency: number
  max_size_bytes: string
  multipart_threshold_bytes: string
  part_size_bytes: string
  scope: string
  session_ttl_seconds: number
  total_quota_bytes: string
  visibility: FileVisibility
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'UPLOAD_INVALID',
    readonly retryable = false,
  ) {
    super(message)
  }
}

export async function cancelUploadSession(id: string, userId: string) {
  return withUploadSessionLock(id, async () => {
    const session = await getOwnedUploadSession(id, userId)
    if (session.status === 'cancelled' || session.status === 'expired' || session.status === 'failed')
      return { status: session.status }
    if (session.status === 'completed')
      return { fileObjectId: session.file_object_id, status: session.status }
    if (session.status === 'verifying') {
      throw new UploadError(
        '文件正在完成校验，请稍后查看上传状态',
        409,
        'UPLOAD_COMPLETION_IN_PROGRESS',
        true,
      )
    }

    const transitioned = await getControlPool().query(`
      update control.upload_sessions set status = 'cancelling'
      where id = $1::uuid and user_id = $2 and status in ('creating', 'uploading')
      returning id
    `, [id, userId])
    if (!transitioned.rowCount)
      throw new UploadError('上传任务状态已变化', 409, 'UPLOAD_STATE_CHANGED', true)

    const provider = await getStorageProviderByProfileId(session.storage_profile_id)
    if (session.provider_upload_id) {
      await provider.abortMultipartUpload({ key: session.object_key, uploadId: session.provider_upload_id })
        .catch(async () => provider.deleteObject(session.object_key).catch(() => undefined))
    }
    await markSessionFileFailed(session)
    await withControlTransaction(async (client) => {
      await client.query(`
        update control.upload_sessions set status = 'cancelled'
        where id = $1::uuid and status = 'cancelling'
      `, [id])
      await client.query(`
        update control.upload_quota_ledger
        set status = 'released', settled_bytes = 0, settled_at = now()
        where upload_session_id = $1::uuid and status = 'reserved'
      `, [id])
    })
    return { status: 'cancelled' as const }
  })
}

export async function completeUploadSession(id: string, userId: string, actorRole: AdminUserRole) {
  return withUploadSessionLock(id, () => completeUploadSessionLocked(id, userId, actorRole))
}

export async function createUploadSession(input: {
  actor: Actor & { role: AdminUserRole }
  checksum?: string
  filename: string
  mimeType: string
  scope: string
  size: number
}) {
  assertUploadScope(input.scope, input.actor.role)
  if (input.scope === 'user-avatar' || input.scope === 'user-profile-background')
    await requireAccountActive(input.actor.id)
  else
    await requireAccountCapability(input.actor.id, 'upload')

  const snapshot = await getRuntimeSnapshot({ fresh: true })
  const policy = await getUploadPolicy(input.scope)
  const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]!.trim()
  const extension = extensionFromFilename(input.filename)
  validateUpload(policy, { extension, mimeType, size: input.size })

  const sessionId = randomUUID()
  const fileObjectId = randomUUID()
  const partSize = Number(policy.part_size_bytes)
  const partCount = Math.ceil(input.size / partSize)
  const date = new Date()
  const objectKey = [
    input.scope,
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    `${fileObjectId}.${extension}`,
  ].join('/')
  const expiresAt = new Date(Date.now() + policy.session_ttl_seconds * 1_000)

  await reserveUpload({
    checksum: input.checksum,
    databaseProfileId: snapshot.database.id,
    expiresAt,
    fileObjectId,
    mimeType,
    objectKey,
    originalName: sanitizeFilename(input.filename, extension),
    partCount,
    partSize,
    policy,
    sessionId,
    size: input.size,
    storageProfileId: snapshot.storage.id,
    userId: input.actor.id,
  })

  const provider = await getStorageProviderByProfileId(snapshot.storage.id)
  let providerUploadId: string | null = null
  try {
    const initialized = await provider.createMultipartUpload({ contentType: mimeType, key: objectKey })
    providerUploadId = initialized.uploadId
    if (input.scope === 'user-avatar') {
      await createPendingAvatar({
        extension,
        id: fileObjectId,
        mimeType,
        objectKey,
        originalName: sanitizeFilename(input.filename, extension),
        ownerUserId: input.actor.id,
        sizeBytes: input.size,
        storageProfileId: snapshot.storage.id,
        uploadSessionId: sessionId,
      })
    }
    else if (input.scope === 'user-profile-background') {
      await createPendingProfileBackground({
        extension,
        id: fileObjectId,
        mimeType,
        objectKey,
        originalName: sanitizeFilename(input.filename, extension),
        ownerUserId: input.actor.id,
        sizeBytes: input.size,
        storageProfileId: snapshot.storage.id,
        uploadSessionId: sessionId,
      })
    }
    else {
      await ensureBusinessUser(input.actor)
      await fileRepository.createPending({
        extension,
        id: fileObjectId,
        mimeType,
        objectKey,
        originalName: sanitizeFilename(input.filename, extension),
        ownerId: input.actor.id,
        sizeBytes: input.size,
        storageProfileId: snapshot.storage.id,
        uploadSessionId: sessionId,
        visibility: policy.visibility,
      })
    }
    await getControlPool().query(`
      update control.upload_sessions
      set provider_upload_id = $2, status = 'uploading'
      where id = $1::uuid and status = 'creating'
    `, [sessionId, providerUploadId])
  }
  catch (error) {
    if (providerUploadId) {
      await provider.abortMultipartUpload({ key: objectKey, uploadId: providerUploadId })
        .catch(() => undefined)
    }
    if (input.scope === 'user-avatar')
      await markAvatarFailed(fileObjectId).catch(() => undefined)
    else if (input.scope === 'user-profile-background')
      await markProfileBackgroundFailed(fileObjectId).catch(() => undefined)
    else
      await fileRepository.markFailed(fileObjectId).catch(() => undefined)
    await failAndReleaseSession(sessionId)
    throw error
  }

  return {
    expiresAt: expiresAt.toISOString(),
    fileObjectId,
    id: sessionId,
    maxConcurrency: policy.max_concurrency,
    partCount,
    partSize,
    provider: snapshot.storage.provider,
    size: input.size,
  }
}

export async function getOwnedUploadSession(id: string, userId: string) {
  const session = await readUploadSession(id)
  if (!session)
    throw new UploadError('上传任务不存在', 404, 'UPLOAD_NOT_FOUND')
  if (session.user_id !== userId)
    throw new UploadError('无权访问该上传任务', 403, 'UPLOAD_FORBIDDEN')
  return session
}

export async function preparePartUpload(input: {
  actorRole: AdminUserRole
  contentLength: number
  partNumber: number
  sessionId: string
  userId: string
}) {
  const session = await getOwnedUploadSession(input.sessionId, input.userId)
  assertUploadScope(session.scope, input.actorRole)
  const [, policy] = await Promise.all([
    assertSessionUsable(session, ['uploading']),
    getUploadPolicy(session.scope),
  ])
  const expectedLength = expectedPartLength(session, input.partNumber)
  if (input.contentLength !== expectedLength)
    throw new UploadError(`分片长度必须为 ${expectedLength} 字节`, 400, 'UPLOAD_PART_LENGTH_MISMATCH')
  if (!session.provider_upload_id)
    throw new UploadError('存储上传任务尚未初始化', 409, 'UPLOAD_NOT_READY')
  return { expectedLength, maxConcurrency: policy.max_concurrency, session }
}

export async function uploadSessionPart(input: {
  actorRole: AdminUserRole
  body: NodeJS.ReadableStream
  contentLength: number
  partNumber: number
  sessionId: string
  userId: string
}) {
  const { maxConcurrency, session } = await preparePartUpload(input)
  const release = acquireUploadSlot(input.userId, input.sessionId, maxConcurrency)
  try {
    const provider = await getStorageProviderByProfileId(session.storage_profile_id)
    const part = await provider.uploadPart({
      body: input.body as import('node:stream').Readable,
      contentLength: input.contentLength,
      key: session.object_key,
      partNumber: input.partNumber,
      uploadId: session.provider_upload_id!,
    })
    await recordUploadedPart(session.id, session.user_id, part)
    return part
  }
  finally {
    release()
  }
}

export async function uploadStatus(id: string, userId: string, actorRole: AdminUserRole) {
  const session = await getOwnedUploadSession(id, userId)
  assertUploadScope(session.scope, actorRole)
  if (session.status === 'uploading' && session.provider_upload_id) {
    const provider = await getStorageProviderByProfileId(session.storage_profile_id)
    const remoteParts = await provider.listParts({
      key: session.object_key,
      uploadId: session.provider_upload_id,
    })
    await replaceUploadedParts(session.id, session.user_id, remoteParts)
    session.parts = remoteParts
  }
  return publicUploadSession(session)
}

async function assertSessionUsable(session: UploadSessionRecord, allowed: UploadSessionRecord['status'][]) {
  if (!allowed.includes(session.status))
    throw new UploadError('上传任务当前状态不可操作', 409, 'UPLOAD_STATE_INVALID')
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await expireSession(session)
    throw new UploadError('上传任务已过期', 410, 'UPLOAD_EXPIRED')
  }
  const snapshot = await getRuntimeSnapshot({ fresh: true })
  if (snapshot.database.id !== session.database_profile_id || snapshot.storage.id !== session.storage_profile_id)
    throw new UploadError('基础设施配置已变化，请取消任务后重新上传', 409, 'UPLOAD_PROFILE_CHANGED')
}

async function assertWonderlandImageContent(
  provider: Awaited<ReturnType<typeof getStorageProviderByProfileId>>,
  objectKey: string,
  declaredMimeType: string,
) {
  const stream = await provider.createReadStream({ end: 15, key: objectKey, start: 0 })
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const header = Buffer.concat(chunks).subarray(0, 16)
  const detected = detectImageMimeType(header)
  if (!detected || detected !== declaredMimeType)
    throw new UploadError('图片真实格式与声明类型不一致', 415, 'UPLOAD_CONTENT_TYPE_MISMATCH')
}

async function completeUploadSessionLocked(id: string, userId: string, actorRole: AdminUserRole) {
  let session = await getOwnedUploadSession(id, userId)
  assertUploadScope(session.scope, actorRole)
  if (session.status === 'completed')
    return { fileObjectId: session.file_object_id, status: session.status }
  await assertSessionUsable(session, ['uploading', 'verifying'])
  const provider = await getStorageProviderByProfileId(session.storage_profile_id)

  if (session.status === 'uploading') {
    if (!session.provider_upload_id)
      throw new UploadError('存储上传任务尚未初始化', 409, 'UPLOAD_NOT_READY')
    const parts = await listCompleteParts({
      expectation: uploadPartsExpectation(session),
      list: () => provider.listParts({ key: session.object_key, uploadId: session.provider_upload_id! }),
    })
    const transitioned = await getControlPool().query(`
      update control.upload_sessions set status = 'verifying', parts = $3::jsonb
      where id = $1::uuid and user_id = $2 and status = 'uploading'
      returning id
    `, [id, userId, JSON.stringify(parts)])
    if (!transitioned.rowCount)
      throw new UploadError('上传任务状态已变化，请刷新后重试', 409, 'UPLOAD_STATE_CHANGED', true)
    session = { ...session, parts, status: 'verifying' }
  }

  const expectedSize = Number(session.total_size_bytes)
  let metadata = await readObjectMetadata(provider, session.object_key)
  if (!metadata) {
    if (!session.provider_upload_id)
      throw new UploadError('存储上传任务尚未初始化', 409, 'UPLOAD_NOT_READY')
    const parts = validateCompleteParts(uploadPartsExpectation(session), session.parts)
    try {
      metadata = await provider.completeMultipartUpload({
        key: session.object_key,
        parts,
        uploadId: session.provider_upload_id,
      })
    }
    catch (error) {
      metadata = await readObjectMetadata(provider, session.object_key)
      if (!metadata)
        throw error
    }
  }
  if (metadata.size !== expectedSize) {
    await failAndReleaseSession(id)
    throw new UploadError('文件完整性校验失败', 409, 'UPLOAD_SIZE_MISMATCH')
  }
  if (session.scope === 'user-profile-background') {
    const background = await findProfileBackgroundById(session.file_object_id)
    const alreadyNormalized = background?.status === 'pending'
      && background.width_px !== null
      && background.height_px !== null
      && background.object_key === session.object_key
    if (!alreadyNormalized) {
      let normalizedObjectKey: string | null = null
      try {
        const sourceObjectKey = session.object_key
        const normalized = await normalizeProfileBackgroundObject({
          declaredMimeType: session.declared_mime_type,
          objectKey: sourceObjectKey,
          provider,
          sourceSize: expectedSize,
        })
        normalizedObjectKey = normalized.objectKey
        const updated = await markProfileBackgroundNormalized({
          fileId: session.file_object_id,
          height: normalized.height,
          mimeType: normalized.mimeType,
          objectKey: normalized.objectKey,
          sizeBytes: normalized.metadata.size,
          uploadSessionId: session.id,
          width: normalized.width,
        })
        if (!updated)
          throw new UploadError('背景图片记录状态更新失败', 500, 'UPLOAD_FILE_UPDATE_FAILED')
        session.object_key = normalized.objectKey
        session.total_size_bytes = String(normalized.metadata.size)
        metadata = normalized.metadata
        await provider.deleteObject(sourceObjectKey).catch(() => undefined)
      }
      catch (error) {
        if (normalizedObjectKey)
          await provider.deleteObject(normalizedObjectKey).catch(() => undefined)
        await provider.deleteObject(session.object_key).catch(() => undefined)
        await markSessionFileFailed(session)
        await failAndReleaseSession(id)
        throw error
      }
    }
  }
  else if (session.scope === 'catalog-icon' || session.scope === 'wonderland-image' || session.scope === 'wonderland-work-image' || session.scope === 'user-avatar') {
    try {
      await assertWonderlandImageContent(provider, session.object_key, session.declared_mime_type)
    }
    catch (error) {
      await provider.deleteObject(session.object_key).catch(() => undefined)
      await markSessionFileFailed(session)
      await failAndReleaseSession(id)
      throw error
    }
  }
  await markSessionFileReady(session, metadata)

  await withControlTransaction(async (client) => {
    const completed = await client.query(`
      update control.upload_sessions
      set status = 'completed', completed_at = coalesce(completed_at, now())
      where id = $1::uuid and user_id = $2 and status in ('verifying', 'completed')
      returning file_object_id
    `, [id, userId])
    if (!completed.rowCount)
      throw new UploadError('上传任务状态已变化', 409, 'UPLOAD_STATE_CHANGED', true)
    await client.query(`
      update control.upload_quota_ledger
      set status = 'committed', settled_bytes = $2, settled_at = coalesce(settled_at, now())
      where upload_session_id = $1::uuid and status in ('reserved', 'committed')
    `, [id, metadata.size])
  })
  return { fileObjectId: session.file_object_id, status: 'completed' as const }
}

function expectedPartLength(session: UploadSessionRecord, partNumber: number) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.part_count)
    throw new UploadError('分片编号超出范围')
  const partSize = Number(session.part_size_bytes)
  const total = Number(session.total_size_bytes)
  return partNumber === session.part_count ? total - partSize * (partNumber - 1) : partSize
}

async function expireSession(session: UploadSessionRecord) {
  const result = await getControlPool().query(`
    update control.upload_sessions set status = 'expired'
    where id = $1::uuid and status = any($2::text[])
    returning id
  `, [session.id, ACTIVE_STATUSES])
  if (!result.rowCount)
    return
  if (session.provider_upload_id) {
    const provider = await getStorageProviderByProfileId(session.storage_profile_id)
    await provider.abortMultipartUpload({ key: session.object_key, uploadId: session.provider_upload_id })
      .catch(() => undefined)
  }
  await markSessionFileFailed(session)
  await getControlPool().query(`
    update control.upload_quota_ledger
    set status = 'released', settled_bytes = 0, settled_at = now()
    where upload_session_id = $1::uuid and status = 'reserved'
  `, [session.id])
}

function extensionFromFilename(filename: string) {
  const extension = path.extname(path.basename(filename)).slice(1).toLowerCase()
  if (!/^[a-z0-9]{1,12}$/.test(extension))
    throw new UploadError('文件扩展名无效')
  return extension
}

async function failAndReleaseSession(sessionId: string) {
  await withControlTransaction(async (client) => {
    await client.query(`
      update control.upload_sessions set status = 'failed'
      where id = $1::uuid and status <> 'completed'
    `, [sessionId])
    await client.query(`
      update control.upload_quota_ledger
      set status = 'released', settled_bytes = 0, settled_at = now()
      where upload_session_id = $1::uuid and status = 'reserved'
    `, [sessionId])
  })
}

async function getUploadPolicy(scope: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(scope))
    throw new UploadError('上传用途无效')
  const result = await getControlPool().query<UploadPolicy>(`
    select * from control.upload_policies where scope = $1
  `, [scope])
  const policy = result.rows[0]
  if (!policy)
    throw new UploadError('该上传用途尚未开放', 403, 'UPLOAD_SCOPE_DISABLED')
  return policy
}

async function markSessionFileFailed(session: UploadSessionRecord) {
  if (session.scope === 'user-avatar')
    await markAvatarFailed(session.file_object_id).catch(() => undefined)
  else if (session.scope === 'user-profile-background')
    await markProfileBackgroundFailed(session.file_object_id).catch(() => undefined)
  else
    await fileRepository.markFailed(session.file_object_id).catch(() => undefined)
}

async function markSessionFileReady(
  session: UploadSessionRecord,
  metadata: { sha256?: string, size: number },
) {
  if (session.scope === 'user-avatar') {
    const avatar = await markAvatarReady(session.file_object_id, metadata.size)
    if (avatar)
      return
    const existing = await findAvatarById(session.file_object_id)
    if (existing?.status === 'ready')
      return
    throw new UploadError('头像记录状态更新失败', 500, 'UPLOAD_FILE_UPDATE_FAILED')
  }

  if (session.scope === 'user-profile-background') {
    const background = await markProfileBackgroundReady(session.file_object_id, metadata.size)
    if (background)
      return
    const existing = await findProfileBackgroundById(session.file_object_id)
    if (existing?.status === 'ready')
      return
    throw new UploadError('背景图片记录状态更新失败', 500, 'UPLOAD_FILE_UPDATE_FAILED')
  }

  const file = await fileRepository.markReady(session.file_object_id, {
    sha256: metadata.sha256,
    sizeBytes: metadata.size,
  })
  if (file)
    return
  const existing = await fileRepository.findById(session.file_object_id)
  if (!existing || existing.status !== 'ready')
    throw new UploadError('文件记录状态更新失败', 500, 'UPLOAD_FILE_UPDATE_FAILED')
}

function publicUploadSession(session: UploadSessionRecord) {
  return {
    completedAt: session.completed_at?.toISOString?.() ?? session.completed_at,
    expiresAt: session.expires_at instanceof Date ? session.expires_at.toISOString() : session.expires_at,
    fileObjectId: session.file_object_id,
    id: session.id,
    partCount: session.part_count,
    parts: session.parts.map(part => ({ partNumber: part.partNumber, size: part.size })),
    partSize: Number(session.part_size_bytes),
    size: Number(session.total_size_bytes),
    status: session.status,
  }
}

async function readObjectMetadata(
  provider: Awaited<ReturnType<typeof getStorageProviderByProfileId>>,
  objectKey: string,
) {
  try {
    return await provider.headObject(objectKey)
  }
  catch (error) {
    if (error instanceof StorageNotFoundError)
      return null
    throw error
  }
}

async function readUploadSession(id: string, client?: PoolClient) {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new UploadError('上传任务编号无效')
  const executor = client ?? getControlPool()
  const result = await executor.query<UploadSessionRecord>(`
    select * from control.upload_sessions where id = $1::uuid
  `, [id])
  return result.rows[0] ?? null
}

async function recordUploadedPart(sessionId: string, userId: string, part: StoragePart) {
  await withControlTransaction(async (client) => {
    const session = await client.query<UploadSessionRecord>(`
      select * from control.upload_sessions
      where id = $1::uuid and user_id = $2 for update
    `, [sessionId, userId])
    const current = session.rows[0]
    if (!current || current.status !== 'uploading')
      throw new UploadError('上传任务状态已变化', 409, 'UPLOAD_STATE_CHANGED')
    const parts = current.parts.filter(item => item.partNumber !== part.partNumber)
    parts.push(part)
    parts.sort((a, b) => a.partNumber - b.partNumber)
    await client.query(`
      update control.upload_sessions set parts = $2::jsonb
      where id = $1::uuid
    `, [sessionId, JSON.stringify(parts)])
  })
}

async function replaceUploadedParts(sessionId: string, userId: string, parts: StoragePart[]) {
  await getControlPool().query(`
    update control.upload_sessions set parts = $3::jsonb
    where id = $1::uuid and user_id = $2 and status = 'uploading'
  `, [sessionId, userId, JSON.stringify(parts)])
}

async function reserveUpload(input: {
  checksum?: string
  databaseProfileId: string
  expiresAt: Date
  fileObjectId: string
  mimeType: string
  objectKey: string
  originalName: string
  partCount: number
  partSize: number
  policy: UploadPolicy
  sessionId: string
  size: number
  storageProfileId: string
  userId: string
}) {
  await withControlTransaction(async (client) => {
    const settings = await client.query<{
      active_database_profile_id: string | null
      default_storage_profile_id: string | null
    }>(`
      select active_database_profile_id, default_storage_profile_id
      from control.runtime_settings where id = true for share
    `)
    const currentSettings = settings.rows[0]
    if (
      currentSettings?.active_database_profile_id !== input.databaseProfileId
      || currentSettings.default_storage_profile_id !== input.storageProfileId
    ) {
      throw new UploadError('基础设施配置已变化，请重新创建上传任务', 409, 'UPLOAD_PROFILE_CHANGED')
    }
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`upload-quota:${input.userId}`])
    const usage = await client.query<{
      active_count: string
      daily_bytes: string
      total_bytes: string
    }>(`
      select
        (select count(*)::text from control.upload_sessions
         where user_id = $1 and scope = $3 and status = any($2::text[]) and expires_at > now()) as active_count,
        coalesce((select sum(case when ledger.status = 'committed' then ledger.settled_bytes else ledger.reserved_bytes end)::text
         from control.upload_quota_ledger ledger
         join control.upload_sessions upload on upload.id = ledger.upload_session_id
         where ledger.user_id = $1 and upload.scope = $3
           and ledger.status in ('reserved', 'committed') and ledger.created_at >= now() - interval '24 hours'), '0') as daily_bytes,
        coalesce((select sum(case when ledger.status = 'committed' then ledger.settled_bytes else ledger.reserved_bytes end)::text
         from control.upload_quota_ledger ledger
         join control.upload_sessions upload on upload.id = ledger.upload_session_id
         where ledger.user_id = $1 and upload.scope = $3
           and ledger.status in ('reserved', 'committed')), '0') as total_bytes
    `, [input.userId, ACTIVE_STATUSES, input.policy.scope])
    const current = usage.rows[0]!
    if (Number(current.active_count) >= input.policy.max_active_sessions)
      throw new UploadError('同时进行的上传任务过多', 429, 'UPLOAD_ACTIVE_LIMIT')
    if (Number(current.daily_bytes) + input.size > Number(input.policy.daily_quota_bytes))
      throw new UploadError('已超过 24 小时上传额度', 429, 'UPLOAD_DAILY_QUOTA')
    if (Number(current.total_bytes) + input.size > Number(input.policy.total_quota_bytes))
      throw new UploadError('已超过账户文件总额度', 429, 'UPLOAD_TOTAL_QUOTA')

    await client.query(`
      insert into control.upload_sessions (
        id, file_object_id, user_id, database_profile_id, storage_profile_id,
        object_key, scope, original_name, declared_mime_type, total_size_bytes,
        reserved_bytes, part_size_bytes, part_count, status, checksum, expires_at
      ) values (
        $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
        $6, $7, $8, $9, $10,
        $10, $11, $12, 'creating', $13, $14
      )
    `, [
      input.sessionId,
      input.fileObjectId,
      input.userId,
      input.databaseProfileId,
      input.storageProfileId,
      input.objectKey,
      input.policy.scope,
      input.originalName,
      input.mimeType,
      input.size,
      input.partSize,
      input.partCount,
      input.checksum ?? null,
      input.expiresAt,
    ])
    await client.query(`
      insert into control.upload_quota_ledger (upload_session_id, user_id, reserved_bytes)
      values ($1::uuid, $2, $3)
    `, [input.sessionId, input.userId, input.size])
  })
}

function uploadPartsExpectation(session: UploadSessionRecord) {
  return {
    partCount: session.part_count,
    partSize: Number(session.part_size_bytes),
    totalSize: Number(session.total_size_bytes),
  }
}

function validateUpload(policy: UploadPolicy, input: { extension: string, mimeType: string, size: number }) {
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > Number(policy.max_size_bytes))
    throw new UploadError(`文件大小不能超过 ${Math.floor(Number(policy.max_size_bytes) / 1024 / 1024)}MB`)
  if (!policy.allowed_extensions.includes(input.extension))
    throw new UploadError('不支持该文件扩展名')
  if (!policy.allowed_mime_types.includes(input.mimeType))
    throw new UploadError('不支持该文件类型')
}

async function withUploadSessionLock<T>(sessionId: string, callback: () => Promise<T>) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId))
    throw new UploadError('上传任务编号无效')
  const client = await getControlPool().connect()
  let locked = false
  try {
    await client.query(`select pg_advisory_lock(hashtextextended($1, 0))`, [`upload-session:${sessionId}`])
    locked = true
    return await callback()
  }
  finally {
    if (locked) {
      await client.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [`upload-session:${sessionId}`])
        .catch(() => undefined)
    }
    client.release()
  }
}

const activeSlots = new Map<string, number>()

function acquireUploadSlot(userId: string, sessionId: string, maxConcurrency: number) {
  const key = `${userId}:${sessionId}`
  const count = activeSlots.get(key) ?? 0
  if (count >= maxConcurrency)
    throw new UploadError('分片上传并发过高', 429, 'UPLOAD_CONCURRENCY_LIMIT')
  activeSlots.set(key, count + 1)
  return () => {
    const next = (activeSlots.get(key) ?? 1) - 1
    if (next <= 0)
      activeSlots.delete(key)
    else
      activeSlots.set(key, next)
  }
}

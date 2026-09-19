import 'server-only'

import { getControlPool, withControlTransaction } from '@/lib/db/control'

export interface ProfileBackgroundFileRecord {
  created_at: Date
  extension: string
  height_px: number | null
  id: string
  mime_type: string
  object_key: string
  original_name: string
  orphaned_at: Date | null
  owner_user_id: string | null
  ready_at: Date | null
  size_bytes: string
  status: 'delete_failed' | 'deleted' | 'deleting' | 'failed' | 'pending' | 'ready'
  storage_profile_id: string
  updated_at: Date
  upload_session_id: string
  width_px: number | null
}

export async function createPendingProfileBackground(input: {
  extension: string
  id: string
  mimeType: string
  objectKey: string
  originalName: string
  ownerUserId: string
  sizeBytes: number
  storageProfileId: string
  uploadSessionId: string
}) {
  const result = await getControlPool().query<ProfileBackgroundFileRecord>(`
    insert into control.user_profile_background_files (
      id, upload_session_id, owner_user_id, storage_profile_id, object_key,
      original_name, size_bytes, mime_type, extension, status
    ) values (
      $1::uuid, $2::uuid, $3, $4::uuid, $5,
      $6, $7, $8, $9, 'pending'
    )
    returning *
  `, [
    input.id,
    input.uploadSessionId,
    input.ownerUserId,
    input.storageProfileId,
    input.objectKey,
    input.originalName,
    input.sizeBytes,
    input.mimeType,
    input.extension,
  ])
  return result.rows[0]!
}

export async function findProfileBackgroundById(id: string) {
  const result = await getControlPool().query<ProfileBackgroundFileRecord>(`
    select * from control.user_profile_background_files where id = $1::uuid
  `, [id])
  return result.rows[0] ?? null
}

export async function markProfileBackgroundFailed(id: string) {
  await getControlPool().query(`
    update control.user_profile_background_files set status = 'failed'
    where id = $1::uuid and status = 'pending'
  `, [id])
}

export async function markProfileBackgroundNormalized(input: {
  fileId: string
  height: number
  mimeType: string
  objectKey: string
  sizeBytes: number
  uploadSessionId: string
  width: number
}) {
  return withControlTransaction(async (client) => {
    const file = await client.query<ProfileBackgroundFileRecord>(`
      update control.user_profile_background_files
      set object_key = $3,
          size_bytes = $4,
          mime_type = $5,
          width_px = $6,
          height_px = $7
      where id = $1::uuid
        and upload_session_id = $2::uuid
        and status = 'pending'
      returning *
    `, [
      input.fileId,
      input.uploadSessionId,
      input.objectKey,
      input.sizeBytes,
      input.mimeType,
      input.width,
      input.height,
    ])
    if (!file.rowCount)
      return null
    const upload = await client.query(`
      update control.upload_sessions
      set object_key = $3, total_size_bytes = $4
      where id = $1::uuid and file_object_id = $2::uuid and status = 'verifying'
      returning id
    `, [input.uploadSessionId, input.fileId, input.objectKey, input.sizeBytes])
    if (!upload.rowCount)
      throw new Error('背景上传会话状态更新失败')
    return file.rows[0]!
  })
}

export async function markProfileBackgroundReady(id: string, sizeBytes: number) {
  const result = await getControlPool().query<ProfileBackgroundFileRecord>(`
    update control.user_profile_background_files
    set status = 'ready', size_bytes = $2, ready_at = coalesce(ready_at, now())
    where id = $1::uuid and status = 'pending' and width_px is not null and height_px is not null
    returning *
  `, [id, sizeBytes])
  return result.rows[0] ?? null
}

import 'server-only'

import { getControlPool } from '@/lib/db/control'

export interface AvatarFileRecord {
  created_at: Date
  extension: string
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
}

export async function createPendingAvatar(input: {
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
  const result = await getControlPool().query<AvatarFileRecord>(`
    insert into control.user_avatar_files (
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

export async function findAvatarById(id: string) {
  const result = await getControlPool().query<AvatarFileRecord>(`
    select * from control.user_avatar_files where id = $1::uuid
  `, [id])
  return result.rows[0] ?? null
}

export async function markAvatarFailed(id: string) {
  await getControlPool().query(`
    update control.user_avatar_files set status = 'failed'
    where id = $1::uuid and status = 'pending'
  `, [id])
}

export async function markAvatarReady(id: string, sizeBytes: number) {
  const result = await getControlPool().query<AvatarFileRecord>(`
    update control.user_avatar_files
    set status = 'ready', size_bytes = $2, ready_at = coalesce(ready_at, now())
    where id = $1::uuid and status = 'pending'
    returning *
  `, [id, sizeBytes])
  return result.rows[0] ?? null
}

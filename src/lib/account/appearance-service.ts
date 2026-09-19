import 'server-only'

import { getControlPool, withControlTransaction } from '@/lib/db/control'

import {
  DEFAULT_PROFILE_APPEARANCE,
  isProfileAppearancePreset,
  parseProfileAppearanceInput,
  ProfileAppearanceValidationError,
} from './appearance'

import type { ProfileAppearance, ProfileAppearanceInput, ProfileBackgroundFit } from './appearance'
import type { PoolClient } from 'pg'

interface AppearanceRow {
  backgroundFileId: string | null
  fit: ProfileBackgroundFit
  height: number
  opacity: number
  positionX: number
  positionY: number
  preset: string
  scale: number
}

export class ProfileAppearanceError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'PROFILE_APPEARANCE_INVALID') {
    super(message)
  }
}

export async function readProfileAppearance(userId: string, client?: PoolClient): Promise<ProfileAppearance> {
  return (await readProfileAppearanceState(userId, client)).appearance
}

export async function readProfileAppearanceState(userId: string, client?: PoolClient): Promise<{
  appearance: ProfileAppearance
  configured: boolean
}> {
  const executor = client ?? getControlPool()
  const result = await executor.query<AppearanceRow>(`
    select
      appearance.background_file_id as "backgroundFileId",
      appearance.preset,
      appearance.opacity::int,
      appearance.fit,
      appearance.scale::int,
      appearance.height::int,
      appearance.position_x::int as "positionX",
      appearance.position_y::int as "positionY"
    from control.user_profile_appearances appearance
    where appearance.user_id = $1
  `, [userId])
  const row = result.rows[0]
  if (!row)
    return { appearance: { ...DEFAULT_PROFILE_APPEARANCE }, configured: false }
  return {
    appearance: {
      ...row,
      backgroundUrl: row.backgroundFileId ? `/api/profile-backgrounds/${row.backgroundFileId}` : null,
      preset: isProfileAppearancePreset(row.preset) ? row.preset : DEFAULT_PROFILE_APPEARANCE.preset,
    },
    configured: true,
  }
}

export async function updateProfileAppearance(userId: string, rawInput: unknown) {
  let input: ProfileAppearanceInput
  try {
    input = parseProfileAppearanceInput(rawInput)
  }
  catch (error) {
    if (error instanceof ProfileAppearanceValidationError)
      throw new ProfileAppearanceError(error.message)
    throw error
  }

  await withControlTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`profile-appearance:${userId}`])
    const account = await client.query<{ status: string }>(`
      select status from auth."user" where id = $1 for update
    `, [userId])
    if (account.rows[0]?.status !== 'active')
      throw new ProfileAppearanceError('账号不存在或不可用', 404, 'ACCOUNT_NOT_FOUND')

    const current = await client.query<{ backgroundFileId: string | null }>(`
      select background_file_id as "backgroundFileId"
      from control.user_profile_appearances
      where user_id = $1
      for update
    `, [userId])
    const oldBackgroundFileId = current.rows[0]?.backgroundFileId ?? null

    if (input.backgroundFileId) {
      const background = await client.query<{ id: string }>(`
        select background.id
        from control.user_profile_background_files background
        join control.upload_sessions upload on upload.id = background.upload_session_id
        where background.id = $1::uuid
          and background.owner_user_id = $2
          and background.status = 'ready'
          and upload.user_id = $2
          and upload.file_object_id = background.id
          and upload.scope = 'user-profile-background'
          and upload.status = 'completed'
        for update of background
      `, [input.backgroundFileId, userId])
      if (!background.rowCount)
        throw new ProfileAppearanceError('背景图片尚未上传完成或不属于当前账号', 409, 'PROFILE_BACKGROUND_NOT_READY')
    }

    await client.query(`
      insert into control.user_profile_appearances (
        user_id, background_file_id, preset, opacity, fit, scale,
        height, position_x, position_y
      ) values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
      on conflict (user_id) do update set
        background_file_id = excluded.background_file_id,
        preset = excluded.preset,
        opacity = excluded.opacity,
        fit = excluded.fit,
        scale = excluded.scale,
        height = excluded.height,
        position_x = excluded.position_x,
        position_y = excluded.position_y
    `, [
      userId,
      input.backgroundFileId,
      input.preset,
      input.opacity,
      input.fit,
      input.scale,
      input.height,
      input.positionX,
      input.positionY,
    ])

    if (oldBackgroundFileId && oldBackgroundFileId !== input.backgroundFileId) {
      await client.query(`
        update control.user_profile_background_files
        set owner_user_id = null, orphaned_at = coalesce(orphaned_at, now())
        where id = $1::uuid and owner_user_id = $2
      `, [oldBackgroundFileId, userId])
    }

    await client.query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values ($1, 'account.appearance.update', 'user', $1, true, 'PROFILE_APPEARANCE_UPDATED', $2::jsonb)
    `, [userId, JSON.stringify({
      backgroundChanged: oldBackgroundFileId !== input.backgroundFileId,
      fit: input.fit,
      height: input.height,
      preset: input.preset,
    })])
  })

  return readProfileAppearance(userId)
}

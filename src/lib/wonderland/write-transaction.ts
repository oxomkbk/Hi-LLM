import 'server-only'

import { getBusinessPool } from '../db/business'
import { getControlPool } from '../db/control'
import { getRuntimeSnapshot } from '../runtime/config'
import { WonderlandError } from './errors'

import type { PoolClient } from 'pg'

type WonderRateAction
  = | 'admin-mutate'
    | 'answer-accept'
    | 'answer-create'
    | 'answer-vote'
    | 'comment-create'
    | 'question-create'
    | 'question-engage'
    | 'question-view'
    | 'question-vote'
    | 'report-create'
    | 'work-create'
    | 'work-like'
    | 'work-view'

export async function withWonderlandWriteTransaction<T>(input: {
  action: WonderRateAction
  identityHash: string
  limit: number
  windowSeconds: number
}, callback: (client: PoolClient) => Promise<T>) {
  const control = await getControlPool().connect()
  let business: PoolClient | undefined

  try {
    await control.query('begin')
    const settings = await control.query<{ active_database_profile_id: string | null }>(`
      select active_database_profile_id
      from control.runtime_settings where id = true for share
    `)
    const databaseProfileId = settings.rows[0]?.active_database_profile_id
    if (!databaseProfileId)
      throw new WonderlandError('社区数据库尚未初始化', 503, 'WONDERLAND_DATABASE_UNAVAILABLE')

    const now = Date.now()
    const windowMilliseconds = input.windowSeconds * 1000
    const windowStart = new Date(Math.floor(now / windowMilliseconds) * windowMilliseconds)
    const rate = await control.query<{ request_count: number }>(`
      insert into control.wonder_rate_buckets (
        database_profile_id, identity_hash, action, window_start, request_count, expires_at
      ) values ($1::uuid, $2, $3, $4, 1, $5)
      on conflict (database_profile_id, identity_hash, action, window_start)
      do update set request_count = control.wonder_rate_buckets.request_count + 1,
                    updated_at = now()
      returning request_count
    `, [databaseProfileId, input.identityHash, input.action, windowStart, new Date(windowStart.getTime() + windowMilliseconds * 2)])
    if ((rate.rows[0]?.request_count ?? 0) > input.limit)
      throw new WonderlandError('操作过于频繁，请稍后再试', 429, 'RATE_LIMITED')

    const snapshot = await getRuntimeSnapshot({ fresh: true })
    if (snapshot.database.id !== databaseProfileId)
      throw new WonderlandError('社区数据库配置正在切换，请稍后重试', 503, 'DATABASE_PROFILE_CHANGED')

    business = await (await getBusinessPool()).connect()
    await business.query('begin')
    const result = await callback(business)
    await business.query('commit')
    await control.query('commit')
    return result
  }
  catch (error) {
    if (business)
      await business.query('rollback').catch(() => undefined)
    await control.query('rollback').catch(() => undefined)
    throw error
  }
  finally {
    business?.release()
    control.release()
  }
}

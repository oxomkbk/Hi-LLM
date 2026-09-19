import 'server-only'

import { Pool } from 'pg'

import { getRuntimeSnapshot } from '@/lib/runtime/config'

import type { PoolClient, PoolConfig, QueryResultRow } from 'pg'

interface BusinessGlobal {
  generation?: PoolGeneration
}

interface PoolGeneration {
  pool: Pool
  profileId: string
  version: number
}

const businessGlobal = globalThis as typeof globalThis & {
  __hillmNavBusinessDatabase?: BusinessGlobal
}

businessGlobal.__hillmNavBusinessDatabase ??= {}

export async function closeBusinessPool() {
  const current = businessGlobal.__hillmNavBusinessDatabase!.generation
  businessGlobal.__hillmNavBusinessDatabase!.generation = undefined
  if (current)
    await current.pool.end()
}

export function databaseErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

export async function ensureBusinessUser(user: {
  email: string
  id: string
  image?: string | null
  name?: string | null
  status?: string
}, client?: PoolClient) {
  const executor = client ?? await getBusinessPool()
  await executor.query(`
    insert into public.app_users (id, email, status, display_name, avatar_url)
    values ($1::uuid, $2, $3, $4, $5)
    on conflict (id) do update
      set email = excluded.email,
          status = excluded.status,
          display_name = coalesce(excluded.display_name, public.app_users.display_name),
          avatar_url = coalesce(excluded.avatar_url, public.app_users.avatar_url),
          updated_at = now()
  `, [
    user.id,
    user.email.toLowerCase(),
    user.status ?? 'active',
    user.name?.trim().slice(0, 80) || null,
    user.image?.trim().slice(0, 2048) || null,
  ])
}

export async function getBusinessPool() {
  const snapshot = await getRuntimeSnapshot()
  const current = businessGlobal.__hillmNavBusinessDatabase!.generation

  if (current?.version === snapshot.configVersion && current.profileId === snapshot.database.id)
    return current.pool

  const config: PoolConfig = {
    application_name: `hillm-nav-business-${snapshot.database.id}`,
    connectionString: snapshot.database.config.connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 20,
    statement_timeout: 15_000,
  }

  if (snapshot.database.provider === 'tencent-postgres') {
    config.ssl = {
      rejectUnauthorized: snapshot.database.config.rejectUnauthorized !== false,
    }
  }

  const pool = new Pool(config)
  await pool.query('select 1')

  businessGlobal.__hillmNavBusinessDatabase!.generation = {
    pool,
    profileId: snapshot.database.id,
    version: snapshot.configVersion,
  }

  if (current)
    void current.pool.end().catch(() => undefined)

  return pool
}

export async function queryBusiness<Row extends QueryResultRow>(text: string, values: unknown[] = []) {
  const pool = await getBusinessPool()
  return pool.query<Row>(text, values)
}

export async function withBusinessTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const pool = await getBusinessPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  }
  catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
  finally {
    client.release()
  }
}

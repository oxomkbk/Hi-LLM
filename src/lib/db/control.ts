import 'server-only'

import { Pool } from 'pg'

import { getControlDatabaseUrl } from './env'

import type { PoolClient, PoolConfig } from 'pg'

interface ControlDatabaseGlobal {
  pool?: Pool
}

const databaseGlobal = globalThis as typeof globalThis & {
  __hillmNavControlDatabase?: ControlDatabaseGlobal
}

export async function closeControlPool() {
  const current = state()
  const pool = current.pool
  current.pool = undefined
  if (pool)
    await pool.end()
}

export function getControlPool() {
  const current = state()
  if (!current.pool) {
    const config: PoolConfig = {
      application_name: 'hillm-nav-control',
      connectionString: getControlDatabaseUrl(),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      statement_timeout: 15_000,
    }

    current.pool = new Pool(config)
    current.pool.on('error', (error) => {
      console.error('控制面 PostgreSQL 连接池异常', safeDatabaseError(error))
    })
  }

  return current.pool
}

export async function withControlTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getControlPool().connect()
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

function safeDatabaseError(error: Error) {
  return { message: error.message, name: error.name }
}

function state() {
  databaseGlobal.__hillmNavControlDatabase ??= {}
  return databaseGlobal.__hillmNavControlDatabase
}

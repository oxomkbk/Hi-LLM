import 'server-only'

import path from 'node:path'

import { decryptConfig, encryptConfig } from '@/lib/db/config-crypto'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { getBootstrapBusinessDatabaseUrl, optionalServerEnv } from '@/lib/db/env'

import type {
  CosStorageProfileConfig,
  DatabaseProfileConfig,
  DatabaseProvider,
  LocalStorageProfileConfig,
  RuntimeSnapshot,
  RuntimeStorageProfile,
  StorageProviderType,
} from './types'
import type { EncryptedConfig } from '@/lib/db/config-crypto'

interface RuntimeRow {
  config_version: string
  database_config: EncryptedConfig
  database_id: string
  database_name: string
  database_provider: DatabaseProvider
  storage_config: EncryptedConfig
  storage_id: string
  storage_name: string
  storage_provider: StorageProviderType
}

let cached: { expiresAt: number, snapshot: RuntimeSnapshot } | undefined

export async function getRuntimeSnapshot(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cached && cached.expiresAt > Date.now())
    return cached.snapshot

  let row = await readRuntimeRow()
  if (!row) {
    await bootstrapRuntimeProfiles()
    row = await readRuntimeRow()
  }
  if (!row)
    throw new Error('基础设施配置尚未初始化')

  const snapshot: RuntimeSnapshot = {
    configVersion: Number(row.config_version),
    database: {
      config: decryptConfig<DatabaseProfileConfig>(row.database_config),
      id: row.database_id,
      name: row.database_name,
      provider: row.database_provider,
    },
    storage: {
      config: row.storage_provider === 'tencent-cos'
        ? decryptConfig<CosStorageProfileConfig>(row.storage_config)
        : decryptConfig<LocalStorageProfileConfig>(row.storage_config),
      id: row.storage_id,
      name: row.storage_name,
      provider: row.storage_provider,
    },
  }

  cached = { expiresAt: Date.now() + 5_000, snapshot }
  return snapshot
}

export async function getStorageProfile(profileId: string): Promise<RuntimeStorageProfile> {
  const result = await getControlPool().query<{
    encrypted_config: EncryptedConfig
    id: string
    name: string
    provider: StorageProviderType
  }>(`
    select id, name, provider, encrypted_config
    from control.storage_profiles
    where id = $1::uuid
  `, [profileId])
  const row = result.rows[0]
  if (!row)
    throw new Error('文件所属的存储配置不存在')

  return {
    config: row.provider === 'tencent-cos'
      ? decryptConfig<CosStorageProfileConfig>(row.encrypted_config)
      : decryptConfig<LocalStorageProfileConfig>(row.encrypted_config),
    id: row.id,
    name: row.name,
    provider: row.provider,
  }
}

export function invalidateRuntimeSnapshot() {
  cached = undefined
}

async function bootstrapRuntimeProfiles() {
  const businessConfig = encryptConfig<DatabaseProfileConfig>({
    connectionString: getBootstrapBusinessDatabaseUrl(),
  })
  const storageConfig = encryptConfig<LocalStorageProfileConfig>({
    rootDirectory: resolveLocalStorageRoot(),
  })

  await withControlTransaction(async (client) => {
    const settings = await client.query<{
      active_database_profile_id: string | null
      default_storage_profile_id: string | null
    }>('select active_database_profile_id, default_storage_profile_id from control.runtime_settings where id = true for update')

    if (settings.rows[0]?.active_database_profile_id && settings.rows[0]?.default_storage_profile_id)
      return

    const database = await client.query<{ id: string }>(`
      insert into control.database_profiles (name, provider, encrypted_config)
      values ('环境变量业务数据库', 'local-postgres', $1::jsonb)
      on conflict (name) do update set updated_at = now()
      returning id
    `, [JSON.stringify(businessConfig)])
    const storage = await client.query<{ id: string }>(`
      insert into control.storage_profiles (name, provider, encrypted_config)
      values ('本地文件存储', 'local-filesystem', $1::jsonb)
      on conflict (name) do update set updated_at = now()
      returning id
    `, [JSON.stringify(storageConfig)])

    await client.query(`
      update control.runtime_settings
      set active_database_profile_id = coalesce(active_database_profile_id, $1),
          default_storage_profile_id = coalesce(default_storage_profile_id, $2),
          config_version = config_version + 1,
          updated_at = now()
      where id = true
    `, [database.rows[0]!.id, storage.rows[0]!.id])

    await client.query(`
      insert into control.audit_logs (
        action, resource_type, success, code, metadata
      ) values (
        'runtime.bootstrap', 'runtime_settings', true, 'RUNTIME_BOOTSTRAPPED', '{}'::jsonb
      )
    `)
  })
}

async function readRuntimeRow() {
  const result = await getControlPool().query<RuntimeRow>(`
    select
      settings.config_version,
      database_profile.id as database_id,
      database_profile.name as database_name,
      database_profile.provider as database_provider,
      database_profile.encrypted_config as database_config,
      storage_profile.id as storage_id,
      storage_profile.name as storage_name,
      storage_profile.provider as storage_provider,
      storage_profile.encrypted_config as storage_config
    from control.runtime_settings settings
    join control.database_profiles database_profile
      on database_profile.id = settings.active_database_profile_id
    join control.storage_profiles storage_profile
      on storage_profile.id = settings.default_storage_profile_id
    where settings.id = true
  `)

  return result.rows[0]
}

function resolveLocalStorageRoot() {
  const configured = optionalServerEnv('LOCAL_STORAGE_ROOT') ?? '.data/storage'
  if (process.env.NODE_ENV === 'production' && !path.isAbsolute(configured))
    throw new Error('生产环境 LOCAL_STORAGE_ROOT 必须是绝对路径')
  return path.resolve(configured)
}

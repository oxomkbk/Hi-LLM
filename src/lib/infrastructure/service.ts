import 'server-only'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Readable } from 'node:stream'

import { Pool } from 'pg'

import { decryptConfig, encryptConfig } from '@/lib/db/config-crypto'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { runMigrations } from '@/lib/db/migrator'
import { getStorageProfile, invalidateRuntimeSnapshot } from '@/lib/runtime/config'
import { getStorageProvider } from '@/lib/storage'

import type { EncryptedConfig } from '@/lib/db/config-crypto'
import type {
  CosStorageProfileConfig,
  DatabaseProfileConfig,
  DatabaseProvider,
  LocalStorageProfileConfig,
  RuntimeDatabaseProfile,
  RuntimeStorageProfile,
  StorageProviderType,
} from '@/lib/runtime/types'
import type { PoolClient } from 'pg'

interface DatabaseProfileRow {
  encrypted_config: EncryptedConfig
  id: string
  last_check_at: Date | null
  last_check_code: string | null
  last_check_ok: boolean | null
  name: string
  provider: DatabaseProvider
  schema_version: string | null
  status: 'archived' | 'selectable'
}

interface StorageProfileRow {
  encrypted_config: EncryptedConfig
  id: string
  last_check_at: Date | null
  last_check_code: string | null
  last_check_ok: boolean | null
  name: string
  provider: StorageProviderType
  status: 'archived' | 'selectable'
}

export class InfrastructureError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'INFRASTRUCTURE_INVALID') {
    super(message)
  }
}

export async function infrastructureOverview() {
  const [settings, databases, storages, activeUploads] = await Promise.all([
    getControlPool().query<{
      active_database_profile_id: string | null
      config_version: string
      default_storage_profile_id: string | null
      updated_at: Date
    }>('select * from control.runtime_settings where id = true'),
    getControlPool().query<DatabaseProfileRow>(`
      select * from control.database_profiles order by status, created_at, id
    `),
    getControlPool().query<StorageProfileRow>(`
      select * from control.storage_profiles order by status, created_at, id
    `),
    getControlPool().query<{ total: string }>(`
      select count(*)::text as total from control.upload_sessions
      where status in ('creating', 'uploading', 'verifying', 'cancelling') and expires_at > now()
    `),
  ])
  const runtime = settings.rows[0]
  return {
    activeUploads: Number(activeUploads.rows[0]?.total ?? 0),
    configVersion: Number(runtime?.config_version ?? 0),
    databaseProfiles: databases.rows.map(row => ({
      active: row.id === runtime?.active_database_profile_id,
      config: databaseConfigSummary(decryptConfig<DatabaseProfileConfig>(row.encrypted_config)),
      id: row.id,
      lastCheckAt: row.last_check_at,
      lastCheckCode: row.last_check_code,
      lastCheckOk: row.last_check_ok,
      name: row.name,
      provider: row.provider,
      schemaVersion: row.schema_version,
      status: row.status,
    })),
    storageProfiles: storages.rows.map(row => ({
      active: row.id === runtime?.default_storage_profile_id,
      config: storageConfigSummary(row),
      id: row.id,
      lastCheckAt: row.last_check_at,
      lastCheckCode: row.last_check_code,
      lastCheckOk: row.last_check_ok,
      name: row.name,
      provider: row.provider,
      status: row.status,
    })),
    updatedAt: runtime?.updated_at,
  }
}

export async function saveDatabaseProfile(input: {
  connectionString: string
  id?: string
  name: string
  provider: DatabaseProvider
  rejectUnauthorized?: boolean
}, actorId: string) {
  if (input.id)
    await assertActiveProfileEditable('database', input.id)
  const name = validateProfileName(input.name)
  if (!['local-postgres', 'tencent-postgres'].includes(input.provider))
    throw new InfrastructureError('数据库类型无效')
  let connectionString = input.connectionString.trim()
  if (input.id && !connectionString) {
    const existing = await readDatabaseProfile(input.id)
    connectionString = existing.config.connectionString
  }
  validatePostgresUrl(connectionString)
  const config: DatabaseProfileConfig = {
    connectionString,
    rejectUnauthorized: input.provider === 'tencent-postgres' ? input.rejectUnauthorized !== false : undefined,
  }
  await migrateAndCheckDatabase({ config, id: input.id ?? randomUUID(), name, provider: input.provider })
  const encrypted = encryptConfig(config)
  const result = input.id
    ? await withControlTransaction(async (client) => {
        await assertProfileEditableInTransaction(client, 'database', input.id!)
        const updated = await client.query<{ id: string }>(`
          update control.database_profiles
          set name = $2, provider = $3, encrypted_config = $4::jsonb,
              status = 'selectable', last_check_at = now(), last_check_ok = true,
              last_check_code = 'DATABASE_READY', schema_version = 'current'
          where id = $1::uuid returning id
        `, [input.id, name, input.provider, JSON.stringify(encrypted)])
        await client.query(`
          update control.runtime_settings
          set config_version = config_version + 1, updated_at = now()
          where id = true and active_database_profile_id = $1::uuid
        `, [input.id])
        return updated
      })
    : await getControlPool().query<{ id: string }>(`
        insert into control.database_profiles (
          name, provider, encrypted_config, schema_version, last_check_at, last_check_ok, last_check_code
        ) values ($1, $2, $3::jsonb, 'current', now(), true, 'DATABASE_READY')
        returning id
      `, [name, input.provider, JSON.stringify(encrypted)])
  if (!result.rows[0])
    throw new InfrastructureError('数据库配置不存在', 404)
  if (input.id)
    invalidateRuntimeSnapshot()
  await writeAudit(actorId, input.id ? 'database_profile.update' : 'database_profile.create', 'database_profile', result.rows[0].id, true, 'DATABASE_PROFILE_SAVED')
  return result.rows[0]
}

export async function saveStorageProfile(input: {
  appId?: string
  bucket?: string
  cdnDomain?: string
  id?: string
  name: string
  provider: StorageProviderType
  region?: string
  rootDirectory?: string
  secretId?: string
  secretKey?: string
}, actorId: string) {
  if (input.id)
    await assertActiveProfileEditable('storage', input.id)
  const name = validateProfileName(input.name)
  if (!['local-filesystem', 'tencent-cos'].includes(input.provider))
    throw new InfrastructureError('存储类型无效')

  let config: CosStorageProfileConfig | LocalStorageProfileConfig
  if (input.provider === 'local-filesystem') {
    const rootDirectory = path.resolve(String(input.rootDirectory || '').trim())
    if (!input.rootDirectory?.trim())
      throw new InfrastructureError('请填写本地存储目录')
    if (process.env.NODE_ENV === 'production' && !path.isAbsolute(input.rootDirectory.trim()))
      throw new InfrastructureError('生产环境本地存储目录必须是绝对路径')
    config = { rootDirectory }
  }
  else {
    const existing = input.id ? await getStorageProfile(input.id).catch(() => null) : null
    const previous = existing?.provider === 'tencent-cos' ? existing.config as CosStorageProfileConfig : null
    const appId = String(input.appId || previous?.appId || '').trim()
    const bucket = String(input.bucket || previous?.bucket || '').trim()
    const region = String(input.region || previous?.region || '').trim()
    const secretId = String(input.secretId || previous?.secretId || '').trim()
    const secretKey = String(input.secretKey || previous?.secretKey || '').trim()
    if (!/^\d{5,20}$/.test(appId) || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(bucket) || !/^[a-z0-9-]{3,40}$/i.test(region))
      throw new InfrastructureError('COS AppId、Bucket 或地域格式无效')
    if (secretId.length < 8 || secretKey.length < 8)
      throw new InfrastructureError('COS 密钥不完整')
    const cdnDomain = normalizeOptionalDomain(input.cdnDomain)
    config = { appId, bucket, cdnDomain, region, secretId, secretKey }
  }

  const profile: RuntimeStorageProfile = {
    config,
    id: input.id ?? randomUUID(),
    name,
    provider: input.provider,
  }
  await checkStorage(profile)
  const encrypted = encryptConfig(config)
  const result = input.id
    ? await withControlTransaction(async (client) => {
        await assertProfileEditableInTransaction(client, 'storage', input.id!)
        const updated = await client.query<{ id: string }>(`
          update control.storage_profiles
          set name = $2, provider = $3, encrypted_config = $4::jsonb,
              status = 'selectable', last_check_at = now(), last_check_ok = true,
              last_check_code = 'STORAGE_READY'
          where id = $1::uuid returning id
        `, [input.id, name, input.provider, JSON.stringify(encrypted)])
        await client.query(`
          update control.runtime_settings
          set config_version = config_version + 1, updated_at = now()
          where id = true and default_storage_profile_id = $1::uuid
        `, [input.id])
        return updated
      })
    : await getControlPool().query<{ id: string }>(`
        insert into control.storage_profiles (
          name, provider, encrypted_config, last_check_at, last_check_ok, last_check_code
        ) values ($1, $2, $3::jsonb, now(), true, 'STORAGE_READY')
        returning id
      `, [name, input.provider, JSON.stringify(encrypted)])
  if (!result.rows[0])
    throw new InfrastructureError('存储配置不存在', 404)
  if (input.id)
    invalidateRuntimeSnapshot()
  await writeAudit(actorId, input.id ? 'storage_profile.update' : 'storage_profile.create', 'storage_profile', result.rows[0].id, true, 'STORAGE_PROFILE_SAVED')
  return result.rows[0]
}

export async function switchInfrastructure(input: {
  databaseProfileId: string
  storageProfileId: string
}, actorId: string) {
  const [database, storage] = await Promise.all([
    readDatabaseProfile(input.databaseProfileId),
    getStorageProfile(input.storageProfileId),
  ])
  await Promise.all([migrateAndCheckDatabase(database), checkStorage(storage)])

  const result = await withControlTransaction(async (client) => {
    const settings = await client.query<{
      active_database_profile_id: string | null
      default_storage_profile_id: string | null
    }>('select active_database_profile_id, default_storage_profile_id from control.runtime_settings where id = true for update')
    const current = settings.rows[0]
    if (!current)
      throw new InfrastructureError('运行时配置不存在', 500)
    const changing = current.active_database_profile_id !== database.id || current.default_storage_profile_id !== storage.id
    if (!changing)
      return { changed: false }

    const active = await client.query<{ total: string }>(`
      select count(*)::text as total from control.upload_sessions
      where status in ('creating', 'uploading', 'verifying', 'cancelling') and expires_at > now()
    `)
    if (Number(active.rows[0]?.total ?? 0) > 0)
      throw new InfrastructureError('存在进行中的文件上传，请完成或取消后再切换', 409, 'ACTIVE_UPLOADS_BLOCK_SWITCH')

    await client.query(`
      update control.runtime_settings
      set active_database_profile_id = $1::uuid,
          default_storage_profile_id = $2::uuid,
          config_version = config_version + 1,
          updated_at = now()
      where id = true
    `, [database.id, storage.id])
    await client.query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values (
        $1, 'runtime.switch', 'runtime_settings', 'singleton', true,
        'RUNTIME_SWITCHED', jsonb_build_object(
          'databaseProfileId', $2::text,
          'storageProfileId', $3::text
        )
      )
    `, [actorId, database.id, storage.id])
    return { changed: true }
  })
  invalidateRuntimeSnapshot()
  return {
    ...result,
    databaseProfileId: database.id,
    storageProfileId: storage.id,
  }
}

async function assertActiveProfileEditable(kind: 'database' | 'storage', profileId: string) {
  const column = kind === 'database' ? 'active_database_profile_id' : 'default_storage_profile_id'
  const active = await getControlPool().query<{ active: boolean }>(`
    select ${column} = $1::uuid as active from control.runtime_settings where id = true
  `, [profileId])
  if (!active.rows[0]?.active)
    return
  const uploads = await getControlPool().query<{ total: string }>(`
    select count(*)::text as total from control.upload_sessions
    where status in ('creating', 'uploading', 'verifying', 'cancelling') and expires_at > now()
  `)
  if (Number(uploads.rows[0]?.total ?? 0) > 0)
    throw new InfrastructureError('当前配置有关联的进行中上传，暂不能修改', 409, 'ACTIVE_UPLOADS_BLOCK_PROFILE_EDIT')
}

async function assertProfileEditableInTransaction(
  client: PoolClient,
  kind: 'database' | 'storage',
  profileId: string,
) {
  const settings = await client.query<{
    active_database_profile_id: string | null
    default_storage_profile_id: string | null
  }>(`
    select active_database_profile_id, default_storage_profile_id
    from control.runtime_settings where id = true for update
  `)
  const current = settings.rows[0]
  const active = kind === 'database'
    ? current?.active_database_profile_id === profileId
    : current?.default_storage_profile_id === profileId
  if (!active)
    return
  const uploads = await client.query<{ total: string }>(`
    select count(*)::text as total from control.upload_sessions
    where status in ('creating', 'uploading', 'verifying', 'cancelling') and expires_at > now()
  `)
  if (Number(uploads.rows[0]?.total ?? 0) > 0)
    throw new InfrastructureError('当前配置有关联的进行中上传，暂不能修改', 409, 'ACTIVE_UPLOADS_BLOCK_PROFILE_EDIT')
}

async function checkStorage(profile: RuntimeStorageProfile) {
  const provider = getStorageProvider(profile)
  await provider.healthCheck()
  const key = `__hillm_nav_healthcheck__/${randomUUID()}.txt`
  try {
    await provider.putObject({
      body: Readable.from(Buffer.from('ok')),
      contentLength: 2,
      contentType: 'text/plain',
      key,
    })
    const metadata = await provider.headObject(key)
    if (metadata.size !== 2)
      throw new InfrastructureError('存储读写校验失败', 409, 'STORAGE_HEALTHCHECK_FAILED')
  }
  finally {
    await provider.deleteObject(key).catch(() => undefined)
  }
}

function databaseConfigSummary(config: DatabaseProfileConfig) {
  try {
    const url = new URL(config.connectionString)
    return {
      database: url.pathname.replace(/^\//, ''),
      host: url.hostname,
      port: url.port || '5432',
      rejectUnauthorized: config.rejectUnauthorized !== false,
      username: decodeURIComponent(url.username),
    }
  }
  catch {
    return { database: '', host: '配置无效', port: '', rejectUnauthorized: true, username: '' }
  }
}

async function migrateAndCheckDatabase(profile: RuntimeDatabaseProfile) {
  const ssl = profile.provider === 'tencent-postgres'
    ? { rejectUnauthorized: profile.config.rejectUnauthorized !== false }
    : undefined
  await runMigrations('business', profile.config.connectionString, { ssl })
  const pool = new Pool({
    application_name: `hillm-nav-profile-check-${profile.id}`,
    connectionString: profile.config.connectionString,
    connectionTimeoutMillis: 5_000,
    max: 1,
    ssl,
    statement_timeout: 10_000,
  })
  try {
    await pool.query(`select 1 from public.hillm_nav_schema_migrations where scope = 'business' limit 1`)
  }
  finally {
    await pool.end()
  }
}

function normalizeOptionalDomain(value?: string) {
  if (!value?.trim())
    return undefined
  let url: URL
  try {
    url = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`)
  }
  catch {
    throw new InfrastructureError('CDN 域名格式无效')
  }
  if (url.protocol !== 'https:' || url.pathname !== '/')
    throw new InfrastructureError('CDN 必须使用纯 HTTPS 域名')
  return url.hostname
}

async function readDatabaseProfile(id: string): Promise<RuntimeDatabaseProfile> {
  const result = await getControlPool().query<DatabaseProfileRow>(`
    select * from control.database_profiles where id = $1::uuid and status = 'selectable'
  `, [id])
  const row = result.rows[0]
  if (!row)
    throw new InfrastructureError('数据库配置不存在或已归档', 404)
  return {
    config: decryptConfig<DatabaseProfileConfig>(row.encrypted_config),
    id: row.id,
    name: row.name,
    provider: row.provider,
  }
}

function storageConfigSummary(row: StorageProfileRow) {
  if (row.provider === 'local-filesystem') {
    const config = decryptConfig<LocalStorageProfileConfig>(row.encrypted_config)
    return { rootDirectory: config.rootDirectory }
  }
  const config = decryptConfig<CosStorageProfileConfig>(row.encrypted_config)
  return {
    appId: config.appId,
    bucket: config.bucket,
    cdnDomain: config.cdnDomain,
    region: config.region,
    secretConfigured: Boolean(config.secretId && config.secretKey),
  }
}

function validatePostgresUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new InfrastructureError('PostgreSQL 连接地址格式无效')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1))
    throw new InfrastructureError('PostgreSQL 连接地址必须包含主机和数据库名')
}

function validateProfileName(value: string) {
  const name = value.trim()
  if (!name || name.length > 80)
    throw new InfrastructureError('配置名称长度必须为 1 到 80 个字符')
  return name
}

async function writeAudit(
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  success: boolean,
  code: string,
) {
  await getControlPool().query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
  `, [actorId, action, resourceType, resourceId, success, code])
}

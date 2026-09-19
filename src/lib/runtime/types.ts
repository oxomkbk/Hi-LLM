export interface CosStorageProfileConfig {
  appId: string
  bucket: string
  cdnDomain?: string
  region: string
  secretId: string
  secretKey: string
}
export interface DatabaseProfileConfig {
  connectionString: string
  rejectUnauthorized?: boolean
}
export type DatabaseProvider = 'local-postgres' | 'tencent-postgres'

export interface LocalStorageProfileConfig {
  rootDirectory: string
}

export type ProfileStatus = 'archived' | 'selectable'

export interface RuntimeDatabaseProfile {
  config: DatabaseProfileConfig
  id: string
  name: string
  provider: DatabaseProvider
}

export interface RuntimeSnapshot {
  configVersion: number
  database: RuntimeDatabaseProfile
  storage: RuntimeStorageProfile
}

export interface RuntimeStorageProfile {
  config: CosStorageProfileConfig | LocalStorageProfileConfig
  id: string
  name: string
  provider: StorageProviderType
}

export type StorageProviderType = 'local-filesystem' | 'tencent-cos'

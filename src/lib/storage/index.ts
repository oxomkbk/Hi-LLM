import 'server-only'

import { getRuntimeSnapshot, getStorageProfile } from '@/lib/runtime/config'

import { CosStorageProvider } from './cos'
import { LocalStorageProvider } from './local'

import type { StorageProvider } from './types'
import type { CosStorageProfileConfig, LocalStorageProfileConfig, RuntimeStorageProfile } from '@/lib/runtime/types'

const providers = new Map<string, StorageProvider>()

export async function getActiveStorageProvider(): Promise<StorageProvider> {
  const snapshot = await getRuntimeSnapshot()
  return getStorageProvider(snapshot.storage)
}

export function getStorageProvider(profile: RuntimeStorageProfile): StorageProvider {
  const cacheKey = `${profile.id}:${JSON.stringify(profile.config)}`
  const cached = providers.get(cacheKey)
  if (cached)
    return cached

  const provider = profile.provider === 'tencent-cos'
    ? new CosStorageProvider(profile.config as CosStorageProfileConfig)
    : new LocalStorageProvider((profile.config as LocalStorageProfileConfig).rootDirectory)
  providers.set(cacheKey, provider)
  return provider
}

export async function getStorageProviderByProfileId(profileId: string): Promise<StorageProvider> {
  return getStorageProvider(await getStorageProfile(profileId))
}

'use client'

import { createContext, use } from 'react'

import { FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS } from '@/lib/access-settings/types'

import type { PublicSiteAccessSettings } from '@/lib/access-settings/types'

export interface AccessSettingsContextValue {
  loading: boolean
  settings: PublicSiteAccessSettings
}

export const AccessSettingsContext = createContext<AccessSettingsContextValue>({
  loading: true,
  settings: FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS,
})

export function useAccessSettings() {
  return use(AccessSettingsContext)
}

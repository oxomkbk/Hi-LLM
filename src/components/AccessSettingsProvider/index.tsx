'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ACCESS_SETTINGS_BROADCAST_CHANNEL,
  ACCESS_SETTINGS_UPDATED_EVENT,
  isAccessSettingsUpdatedMessage,
} from '@/lib/access-settings/client-sync'
import { FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS } from '@/lib/access-settings/types'

import { AccessSettingsContext } from './context'

import type { PublicSiteAccessSettings } from '@/lib/access-settings/types'
import type { IResponse } from '@/types'
import type { PropsWithChildren } from 'react'

export default function AccessSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS)
  const [loading, setLoading] = useState(true)
  const hasValidSettingsRef = useRef(false)
  const requestControllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    try {
      const response = await fetch('/api/public/access-settings', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      })
      if (!response.ok)
        throw new Error('访问策略加载失败')
      const result = await response.json() as IResponse<PublicSiteAccessSettings>
      if (!result.data)
        throw new Error('访问策略响应无效')
      hasValidSettingsRef.current = true
      setSettings(result.data)
    }
    catch (error) {
      if ((error as Error).name !== 'AbortError' && !hasValidSettingsRef.current)
        setSettings(FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS)
    }
    finally {
      if (!controller.signal.aborted) {
        requestControllerRef.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => requestControllerRef.current?.abort()
  }, [refresh])

  useEffect(() => {
    const handleRefresh = () => void refresh()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible')
        handleRefresh()
    }
    let channel: BroadcastChannel | null = null
    try {
      channel = 'BroadcastChannel' in window
        ? new BroadcastChannel(ACCESS_SETTINGS_BROADCAST_CHANNEL)
        : null
    }
    catch {
      channel = null
    }
    const handleBroadcast = (event: MessageEvent<unknown>) => {
      if (isAccessSettingsUpdatedMessage(event.data))
        handleRefresh()
    }

    window.addEventListener(ACCESS_SETTINGS_UPDATED_EVENT, handleRefresh)
    window.addEventListener('focus', handleRefresh)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    channel?.addEventListener('message', handleBroadcast)

    return () => {
      window.removeEventListener(ACCESS_SETTINGS_UPDATED_EVENT, handleRefresh)
      window.removeEventListener('focus', handleRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel?.removeEventListener('message', handleBroadcast)
      channel?.close()
    }
  }, [refresh])

  const value = useMemo(() => ({ loading, settings }), [loading, settings])
  return <AccessSettingsContext value={value}>{children}</AccessSettingsContext>
}

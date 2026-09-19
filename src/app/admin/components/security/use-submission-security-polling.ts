'use client'

import { useEffect } from 'react'

import { request } from '@/lib/request'

export function useSubmissionSecurityPolling<T>(input: {
  enabled: boolean
  endpoint: string
  onUpdate: (value: T) => void
}) {
  const { enabled, endpoint, onUpdate } = input
  useEffect(() => {
    if (!enabled)
      return
    let mounted = true
    let requesting = false
    const refresh = async () => {
      if (requesting || document.visibilityState === 'hidden')
        return
      requesting = true
      try {
        const response = await request<T>(endpoint)
        if (mounted)
          onUpdate(response.data)
      }
      catch {
        // The page-level request will expose persistent errors on the next action.
      }
      finally {
        requesting = false
      }
    }
    const interval = window.setInterval(() => void refresh(), 2500)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [enabled, endpoint, onUpdate])
}

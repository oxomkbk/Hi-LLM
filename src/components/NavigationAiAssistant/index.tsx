'use client'

import { Sparkles } from '@gravity-ui/icons'
import { useEffect, useRef, useState } from 'react'

import { CATALOG_AI_SURFACES } from '@/lib/catalog-ai/config'

import NavigationAiPanel from './navigation-ai-panel'

import type { CatalogAiScope } from '@/lib/catalog-ai/types'
import type { IResponse } from '@/types'

interface NavigationAiAssistantProps {
  onOpenChange?: (open: boolean) => void
  open?: boolean
  scope?: CatalogAiScope
}

export default function NavigationAiAssistant({ onOpenChange, open: controlledOpen, scope = 'navigation' }: NavigationAiAssistantProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const open = controlledOpen ?? internalOpen

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/public/navigation-ai?scope=${encodeURIComponent(scope)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => response.ok ? response.json() as Promise<IResponse<{ enabled: boolean }>> : null)
      .then(result => setEnabled(Boolean(result?.data.enabled)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [scope])

  if (enabled === null) {
    return <div aria-hidden="true" className="navigation-ai-root navigation-ai-root-placeholder" />
  }

  if (!enabled)
    return null

  const updateOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined)
      setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const close = () => {
    updateOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const surface = CATALOG_AI_SURFACES[scope]

  return (
    <div data-open={open ? 'true' : 'false'} data-scope={scope} className="navigation-ai-root">
      {open
        ? <NavigationAiPanel open scope={scope} onClose={close} />
        : (
            <div className="navigation-ai-trigger-glow">
              <button
                ref={triggerRef}
                aria-controls="navigation-ai-panel"
                aria-expanded="false"
                aria-label={`打开${surface.triggerLabel}`}
                type="button"
                onClick={() => updateOpen(true)}
                className="navigation-ai-trigger"
              >
                <span aria-hidden="true" className="navigation-ai-trigger-icon"><Sparkles /></span>
                <span className="navigation-ai-trigger-label">{surface.triggerLabel}</span>
              </button>
            </div>
          )}
    </div>
  )
}

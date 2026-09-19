'use client'

import { useEffect, useRef } from 'react'

interface ReturnTargetRestorerProps {
  fallbackId?: string
  ready: boolean
}

export default function ReturnTargetRestorer({ fallbackId, ready }: ReturnTargetRestorerProps) {
  const restoredHashRef = useRef('')

  useEffect(() => {
    if (!ready || !window.location.hash || restoredHashRef.current === window.location.hash)
      return

    const rawTarget = window.location.hash.slice(1)
    let targetId = rawTarget
    try {
      targetId = decodeURIComponent(rawTarget)
    }
    catch {}

    if (!targetId.startsWith('return-'))
      return

    restoredHashRef.current = window.location.hash
    const frame = window.requestAnimationFrame(() => {
      const target = window.document.getElementById(targetId)
      const fallback = fallbackId ? window.document.getElementById(fallbackId) : null
      const destination = target ?? fallback
      if (!destination)
        return

      destination.scrollIntoView({ behavior: 'auto', block: target ? 'center' : 'start' })
      if (target instanceof HTMLElement)
        target.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [fallbackId, ready])

  return null
}

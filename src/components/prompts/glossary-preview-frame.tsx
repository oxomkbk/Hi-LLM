'use client'

import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'

import { buildGlossaryPreviewSrcDoc } from '@/lib/prompts/glossary-preview'

import styles from './glossary-preview-frame.module.css'

import type { PromptGlossaryPreview } from '@/lib/prompts/glossary-preview'

export default function GlossaryPreviewFrame({
  className = '',
  compact = false,
  css,
  preview,
}: {
  className?: string
  compact?: boolean
  css: string
  preview: PromptGlossaryPreview | null | undefined
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light'
  const srcDoc = useMemo(
    () => visible && preview ? buildGlossaryPreviewSrcDoc(preview, css, theme) : undefined,
    [css, preview, theme, visible],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host)
      return
    if (!('IntersectionObserver' in window)) {
      const timer = globalThis.setTimeout(setVisible, 0, true)
      return () => globalThis.clearTimeout(timer)
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '200px' },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={hostRef} className={`${styles.root} ${compact ? styles.compact : ''} ${className}`}>
      {preview
        ? (
            srcDoc
              ? (
                  <iframe
                    aria-hidden="true"
                    title={preview.summary}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox=""
                    srcDoc={srcDoc}
                    tabIndex={-1}
                    className={styles.frame}
                  />
                )
              : <span aria-hidden="true" className={styles.placeholder} />
          )
        : <p className={styles.unavailable}>暂无安全预览</p>}
    </div>
  )
}

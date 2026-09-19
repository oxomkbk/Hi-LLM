'use client'

import { useEffect, useRef, useState } from 'react'

import GlossaryPreviewFrame from '@/components/prompts/glossary-preview-frame'

import styles from './prompt-card.module.css'

import type { PromptGlossaryPreview } from '@/lib/prompts/glossary-preview'
import type { GlossaryShowcaseDefinition } from '@/lib/prompts/glossary-showcase'
import type { IResponse } from '@/types'

interface PreviewResponse {
  css: string
  fingerprint: string
  preview: PromptGlossaryPreview
}

export default function GlossaryCardCover({ showcase }: { showcase: GlossaryShowcaseDefinition }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [bundle, setBundle] = useState<PreviewResponse | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host)
      return
    const controller = new AbortController()
    let requested = false
    const load = async () => {
      if (requested)
        return
      requested = true
      try {
        const response = await fetch(`/api/public/prompts/${encodeURIComponent(showcase.slug)}/glossary-preview`, { signal: controller.signal })
        if (!response.ok)
          return
        const result = await response.json() as IResponse<PreviewResponse>
        if (result.data)
          setBundle(result.data)
      }
      catch {
        // The visible quote remains a useful, non-executable fallback.
      }
    }
    if (!('IntersectionObserver' in window)) {
      void load()
      return () => controller.abort()
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        void load()
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(host)
    return () => {
      controller.abort()
      observer.disconnect()
    }
  }, [showcase.slug])

  return (
    <div ref={hostRef} aria-hidden="true" className={styles.glossaryCover}>
      <div className={styles.glossaryCoverVisual}>
        {bundle ? <GlossaryPreviewFrame compact css={bundle.css} preview={bundle.preview} /> : null}
      </div>
      {!bundle ? <p className={styles.glossaryCoverQuote}>{showcase.before}</p> : null}
      <div className={styles.glossaryCoverRail}>
        <span>模糊需求</span>
        <i>→</i>
        <strong>可视化术语</strong>
        <i>→</i>
        <span>AI 指令</span>
      </div>
    </div>
  )
}

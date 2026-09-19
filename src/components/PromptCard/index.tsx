'use client'

/* User-managed private assets must retain their prompt-scoped URL and no-store policy. */
/* eslint-disable next/no-img-element */

import { useState } from 'react'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import SecurityBadge from '@/components/security/security-badge'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { getGlossaryShowcaseDefinition } from '@/lib/prompts/glossary-showcase'

import GlossaryCardCover from './glossary-card-cover'
import styles from './prompt-card.module.css'

import type { Prompt } from '@/types'

export default function PromptCard({ prompt, returnTo, termQuery }: { prompt: Prompt, returnTo?: string, termQuery?: string }) {
  const [mediaFailed, setMediaFailed] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const kind = PROMPT_CONTENT_KINDS.find(item => item.value === prompt.content_kind)?.label ?? 'Prompt'
  const cover = mediaFailed ? null : prompt.cover_asset
  const hasImage = Boolean(cover?.url && cover.mime_type?.startsWith('image/'))
  const hasVideo = Boolean(cover?.url && cover.mime_type?.startsWith('video/'))
  const category = prompt.categories[0]?.name || kind
  const tag = prompt.tags.find(item => item !== category)
  const glossaryShowcase = getGlossaryShowcaseDefinition(prompt.slug)
  const targetId = returnTargetId('prompt', prompt.id)
  const baseDetailHref = termQuery
    ? `/prompts/${prompt.slug}?term=${encodeURIComponent(termQuery)}`
    : `/prompts/${prompt.slug}`
  const contextualHref = returnTo
    ? buildContextualHref(baseDetailHref, returnTo, targetId)
    : undefined

  const handleMediaError = () => {
    setMediaReady(false)
    setMediaFailed(true)
  }

  return (
    <ConfigurableDetailLink
      aria-label={`查看 Prompt：${prompt.title}`}
      id={targetId}
      contextualHref={contextualHref}
      data-kind={prompt.content_kind}
      href={baseDetailHref}
      className={styles.card}
    >
      <article className={styles.article}>
        <div className={styles.media}>
          {glossaryShowcase
            ? <GlossaryCardCover showcase={glossaryShowcase} />
            : (
                <div aria-hidden="true" className={styles.fallback}>
                  <span className={styles.fallbackEyebrow}>
                    {kind}
                    {' '}
                    Prompt
                  </span>
                  <strong>{prompt.title}</strong>
                </div>
              )}

          {hasImage
            ? (
                <img
                  alt={cover?.alt_text || prompt.title}
                  decoding="async"
                  height="400"
                  loading="lazy"
                  src={cover?.url}
                  width="640"
                  onError={handleMediaError}
                  onLoad={() => setMediaReady(true)}
                  className={`${styles.asset} ${mediaReady ? styles.assetReady : ''}`}
                />
              )
            : hasVideo
              ? (
                  <video
                    aria-hidden="true"
                    muted
                    playsInline
                    preload="metadata"
                    src={cover?.url}
                    onError={handleMediaError}
                    onLoadedData={() => setMediaReady(true)}
                    className={`${styles.asset} ${mediaReady ? styles.assetReady : ''}`}
                  />
                )
              : null}

          <div aria-hidden="true" data-has-media={mediaReady || undefined} className={styles.scrim} />
          <div className={styles.overlay}>
            <span className={styles.kind}>{kind}</span>
            <span className={styles.security}>
              <SecurityBadge compact showScore subject={prompt} />
            </span>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.titleRow}>
            <h3>{prompt.title}</h3>
            {prompt.featured ? <span className={styles.featured}>精选</span> : null}
          </div>
          <p className={styles.summary}>
            <span className={styles.summaryLabel}>用途</span>
            {prompt.summary}
          </p>
          <footer className={styles.footer}>
            <span>{category}</span>
            {tag ? <span>{tag}</span> : null}
          </footer>
        </div>
      </article>
    </ConfigurableDetailLink>
  )
}

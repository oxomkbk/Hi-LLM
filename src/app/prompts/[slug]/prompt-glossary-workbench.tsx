'use client'

import { ArrowLeft, ArrowRight, ArrowRotateLeft, Check, Copy } from '@gravity-ui/icons'
import { Button, SearchField } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import GlossaryPreviewFrame from '@/components/prompts/glossary-preview-frame'
import {
  filterPromptGlossary,
  formatPromptGlossaryMarkdown,
  promptGlossaryItemCount,
} from '@/lib/prompts/glossary'
import {
  flattenPromptGlossary,
  movePromptGlossaryIndex,
  resolveActivePromptGlossaryIndex,
} from '@/lib/prompts/glossary-reader'
import { resolveGlossaryShowcase } from '@/lib/prompts/glossary-showcase'

import styles from './prompt-glossary-workbench.module.css'

import type { PromptGlossaryDocument } from '@/lib/prompts/glossary'
import type { PromptGlossaryPreviewBundle } from '@/lib/prompts/glossary-preview'
import type { KeyboardEvent } from 'react'

export default function PromptGlossaryWorkbench({
  document,
  initialQuery,
  previewBundle,
  slug,
  title,
}: {
  document: PromptGlossaryDocument
  initialQuery: string
  previewBundle: PromptGlossaryPreviewBundle | null
  slug: string
  title: string
}) {
  const showcase = useMemo(() => resolveGlossaryShowcase(slug, document), [document, slug])
  const firstItemId = document.sections[0]?.items[0]?.id ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [sectionId, setSectionId] = useState('all')
  const [selectedItemId, setSelectedItemId] = useState(showcase?.termId ?? firstItemId)
  const [copiedId, setCopiedId] = useState('')
  const [copyAnnouncement, setCopyAnnouncement] = useState('')
  const copyTimerRef = useRef<number | null>(null)
  const filtered = useMemo(
    () => filterPromptGlossary(document, query, sectionId),
    [document, query, sectionId],
  )
  const visibleItems = useMemo(() => flattenPromptGlossary(filtered), [filtered])
  const visibleIndexById = useMemo(
    () => new Map(visibleItems.map((entry, index) => [entry.item.id, index])),
    [visibleItems],
  )
  const activeIndex = resolveActivePromptGlossaryIndex(visibleItems, selectedItemId)
  const active = visibleItems[activeIndex] ?? null
  const total = promptGlossaryItemCount(document)
  const queryCounts = useMemo(
    () => new Map(document.sections.map(section => [section.id, filterPromptGlossary(document, query, section.id).total])),
    [document, query],
  )

  useEffect(() => () => {
    if (copyTimerRef.current !== null)
      window.clearTimeout(copyTimerRef.current)
  }, [])

  const copy = async (text: string, id: string, successMessage: string) => {
    const copied = await copyText(text)
    setCopyAnnouncement(copied ? successMessage : '复制失败，请直接选择表达文本手动复制。')
    if (!copied)
      return
    setCopiedId(id)
    if (copyTimerRef.current !== null)
      window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(setCopiedId, 1800, '')
  }

  const clearFilters = () => {
    setQuery('')
    setSectionId('all')
  }

  const selectVisibleItem = (index: number, moveFocus = false) => {
    const entry = visibleItems[index]
    if (!entry)
      return
    setSelectedItemId(entry.item.id)
    if (moveFocus)
      window.requestAnimationFrame(() => window.document.getElementById(termButtonId(entry.item.id))?.focus())
  }

  const moveTermFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home']
    if (!keys.includes(event.key))
      return
    event.preventDefault()
    const nextIndex = movePromptGlossaryIndex(index, visibleItems.length, event.key as Parameters<typeof movePromptGlossaryIndex>[2])
    selectVisibleItem(nextIndex, true)
  }

  const activePreview = active ? previewBundle?.items[active.item.id] : undefined
  const activeShowcase = showcase?.termId === active?.item.id ? showcase : null
  const resultAnnouncement = query
    ? `找到 ${visibleItems.length} 个与“${query}”相关的术语${active ? `，当前为${active.item.label}` : ''}`
    : `当前显示 ${visibleItems.length} 个术语${active ? `，当前为${active.item.label}` : ''}`

  return (
    <section aria-labelledby="prompt-glossary-title" className={styles.root}>
      <header className={styles.guideBar}>
        <div className={styles.guideCopy}>
          <p className={styles.eyebrow}>术语速查 · 面向 AI 协作</p>
          <h2 id="prompt-glossary-title">按场景查找术语，理解后直接使用</h2>
          <p>{document.intro}</p>
        </div>
        <div className={styles.guideActions}>
          <dl className={styles.metrics}>
            <div>
              <dt>术语</dt>
              <dd>{total}</dd>
            </div>
            <div>
              <dt>分组</dt>
              <dd>{document.sections.length}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void copy(formatPromptGlossaryMarkdown(document, title), 'all-copy', '整套术语表达已复制。')}
          >
            {copiedId === 'all-copy' ? <Check /> : <Copy />}
            {copiedId === 'all-copy' ? '整套已复制' : '复制整套'}
          </Button>
        </div>
      </header>

      <div className={styles.controlDeck}>
        <SearchField
          aria-label="搜索当前术语合集"
          name="glossary-search"
          variant="secondary"
          fullWidth
          value={query}
          onChange={setQuery}
        >
          <SearchField.Group className={styles.searchGroup}>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="描述你的问题，例如：保存后没有反馈…" />
            <SearchField.ClearButton aria-label="清除搜索" />
          </SearchField.Group>
        </SearchField>
        <nav aria-label="术语分组" className={styles.sectionNav}>
          <button aria-current={sectionId === 'all' ? 'page' : undefined} type="button" onClick={() => setSectionId('all')}>
            全部
            <small>{filterPromptGlossary(document, query).total}</small>
          </button>
          {document.sections.map(section => (
            <button key={section.id} aria-current={sectionId === section.id ? 'page' : undefined} type="button" onClick={() => setSectionId(section.id)}>
              {section.title}
              <small>{queryCounts.get(section.id) ?? 0}</small>
            </button>
          ))}
        </nav>
      </div>

      {active
        ? (
            <div className={styles.readerLayout}>
              <aside aria-label="术语目录" className={styles.indexPanel}>
                <header>
                  <div>
                    <span>术语目录</span>
                    <strong>{`${visibleItems.length} 项`}</strong>
                  </div>
                  {query || sectionId !== 'all'
                    ? (
                        <button type="button" onClick={clearFilters}>
                          <ArrowRotateLeft />
                          清除
                        </button>
                      )
                    : null}
                </header>
                <div aria-label="选择要查看的术语" role="listbox" className={styles.termList}>
                  {filtered.sections.map(section => (
                    <div key={section.id} aria-label={section.title} role="group" className={styles.termGroup}>
                      <h3>{section.title}</h3>
                      {section.items.map((item) => {
                        const index = visibleIndexById.get(item.id) ?? 0
                        const selected = active.item.id === item.id
                        return (
                          <button
                            key={item.id}
                            aria-selected={selected}
                            id={termButtonId(item.id)}
                            role="option"
                            type="button"
                            tabIndex={selected ? 0 : -1}
                            onClick={() => setSelectedItemId(item.id)}
                            onKeyDown={event => moveTermFocus(event, index)}
                            className={styles.termButton}
                          >
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <span>
                              <strong>{item.label}</strong>
                              <code>{item.term}</code>
                            </span>
                            <ArrowRight aria-hidden="true" />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </aside>

              <article aria-labelledby={`term-title-${active.item.id}`} className={styles.focusPanel}>
                <header className={styles.focusHeader}>
                  <div>
                    <span>{active.section.title}</span>
                    <p>{`${String(activeIndex + 1).padStart(2, '0')} / ${String(visibleItems.length).padStart(2, '0')}`}</p>
                  </div>
                  <h3 id={`term-title-${active.item.id}`}>{active.item.label}</h3>
                  <code>{active.item.term}</code>
                  <div className={styles.focusProgress}>
                    <progress
                      aria-label={`当前阅读第 ${activeIndex + 1} 项，共 ${visibleItems.length} 项`}
                      max={visibleItems.length}
                      value={activeIndex + 1}
                    />
                    <span>{`${Math.round(((activeIndex + 1) / visibleItems.length) * 100)}%`}</span>
                  </div>
                </header>

                <div className={styles.focusBody}>
                  <div className={styles.visualColumn}>
                    <div className={styles.previewToolbar}>
                      <span>
                        <i aria-hidden="true" />
                        语义预览
                      </span>
                      <small>当前术语 · 安全隔离</small>
                    </div>
                    <div className={styles.focusVisual}>
                      <GlossaryPreviewFrame css={previewBundle?.css ?? ''} preview={activePreview} className={styles.focusPreview} />
                      {activePreview ? <span>{activePreview.summary}</span> : null}
                    </div>
                  </div>

                  <div className={styles.focusDetails}>
                    {activeShowcase
                      ? (
                          <aside className={styles.contextExample}>
                            <span>你可能会这样说</span>
                            <blockquote>{activeShowcase.before}</blockquote>
                            <p>
                              <strong>AI 最终会明白：</strong>
                              {activeShowcase.outcome}
                            </p>
                          </aside>
                        )
                      : null}

                    <section className={styles.explanation}>
                      <span>一句话理解</span>
                      <p>{active.item.description}</p>
                    </section>

                    <section className={styles.promptBox}>
                      <div>
                        <span>直接告诉 AI</span>
                        <p>{active.item.prompt}</p>
                      </div>
                      <Button
                        aria-label={`复制${active.item.label}的表达`}
                        variant="primary"
                        onPress={() => void copy(active.item.prompt, active.item.id, `${active.item.label}的表达已复制。`)}
                      >
                        {copiedId === active.item.id ? <Check /> : <Copy />}
                        {copiedId === active.item.id ? '已复制' : '复制这条表达'}
                      </Button>
                    </section>
                  </div>
                </div>

                <footer className={styles.focusFooter}>
                  <Button size="sm" variant="tertiary" isDisabled={activeIndex <= 0} onPress={() => selectVisibleItem(activeIndex - 1)}>
                    <ArrowLeft />
                    上一个
                  </Button>
                  <span>{active.section.description}</span>
                  <Button size="sm" variant="tertiary" isDisabled={activeIndex >= visibleItems.length - 1} onPress={() => selectVisibleItem(activeIndex + 1)}>
                    下一个
                    <ArrowRight />
                  </Button>
                </footer>
              </article>
            </div>
          )
        : (
            <div className={styles.empty}>
              <span aria-hidden="true">0</span>
              <h3>没有找到对应术语</h3>
              <p>换一个更短的描述，或清除筛选查看完整合集。</p>
              <Button variant="secondary" onPress={clearFilters}>查看全部术语</Button>
            </div>
          )}

      <p aria-atomic="true" aria-live="polite" className="sr-only">{`${resultAnnouncement}。${copyAnnouncement}`}</p>
    </section>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    const textarea = window.document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    window.document.body.append(textarea)
    textarea.select()
    try {
      return window.document.execCommand('copy')
    }
    catch {
      return false
    }
    finally {
      textarea.remove()
    }
  }
}

function termButtonId(id: string) {
  return `glossary-term-${id}`
}

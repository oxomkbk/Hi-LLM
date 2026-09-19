'use client'

/* Catalog imagery can be backed by private app-file routes or configured object-storage hosts. */
/* eslint-disable next/no-img-element */

import {
  ArrowRight,
  ArrowUpRightFromSquare,
  CircleInfo,
  Magnifier,
  PaperPlane,
} from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import { CATALOG_AI_SURFACES } from '@/lib/catalog-ai/config'
import {
  NAVIGATION_AI_REQUEST_HEADER,
  NAVIGATION_AI_REQUEST_HEADER_VALUE,
} from '@/lib/navigation-ai/request-transport'
import { recordWebsiteVisit } from '@/lib/website-visit'

import type { CatalogAiMessage, CatalogAiResponse, CatalogAiResultItem, CatalogAiScope } from '@/lib/catalog-ai/types'
import type { IResponse } from '@/types'
import type { RefObject } from 'react'

interface NavigationAiPanelProps {
  onClose: () => void
  open: boolean
  scope: CatalogAiScope
}

type SubmissionSource = 'composer' | 'refinement'

export default function NavigationAiPanel({ onClose, open, scope }: NavigationAiPanelProps) {
  const [history, setHistory] = useState<CatalogAiMessage[]>([])
  const [lastQuery, setLastQuery] = useState('')
  const [result, setResult] = useState<CatalogAiResponse | null>(null)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingRefinement, setPendingRefinement] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const inFlightRef = useRef(false)
  const lastSubmissionRef = useRef<{ key: string, time: number } | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const panelState = result ? 'results' : pending ? 'loading' : 'prompt'
  const populated = panelState !== 'prompt'
  const surface = CATALOG_AI_SURFACES[scope]

  useEffect(() => {
    if (!open)
      return

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  useEffect(() => () => requestRef.current?.abort(), [])

  const reset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    inFlightRef.current = false
    setHistory([])
    setLastQuery('')
    setResult(null)
    setValue('')
    setPending(false)
    setPendingRefinement('')
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const submit = useCallback(async (rawValue: string, source: SubmissionSource = 'composer') => {
    const content = rawValue.trim()
    if (!content || inFlightRef.current)
      return

    const requestHistory = compactHistory([...history, { content, role: 'user' }])
    const submissionKey = `${scope}:${requestHistory.map(message => `${message.role}:${message.content.trim().toLocaleLowerCase('zh-CN')}`).join('|')}`
    const now = Date.now()
    if (lastSubmissionRef.current?.key === submissionKey && now - lastSubmissionRef.current.time < 1_500)
      return

    lastSubmissionRef.current = { key: submissionKey, time: now }
    inFlightRef.current = true
    setLastQuery(content)
    setValue(source === 'refinement' ? '' : content)
    setPendingRefinement(source === 'refinement' ? content : '')
    setError('')
    setPending(true)

    const controller = new AbortController()
    requestRef.current = controller

    try {
      const response = await fetch('/api/public/navigation-ai', {
        body: JSON.stringify({ messages: requestHistory, scope }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
        },
        method: 'POST',
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => null) as IResponse<CatalogAiResponse> | null
      if (!response.ok || !payload || payload.code !== 200)
        throw new Error(payload?.msg || '搜索暂时不可用')

      setResult(payload.data)
      setHistory(compactHistory([
        ...requestHistory,
        { content: payload.data.answer, role: 'assistant' },
      ]))
    }
    catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError')
        return
      if (source === 'composer')
        setValue(current => current || content)
      setError(requestError instanceof Error ? requestError.message : '搜索暂时不可用')
    }
    finally {
      if (requestRef.current === controller)
        requestRef.current = null
      inFlightRef.current = false
      setPending(false)
      setPendingRefinement('')
    }
  }, [history, scope])

  if (!open)
    return null

  return (
    <section
      aria-busy={pending}
      aria-label={surface.triggerLabel}
      id="navigation-ai-panel"
      role="search"
      data-error={error ? 'true' : 'false'}
      data-state={panelState}
      data-thinking={pending ? 'true' : 'false'}
      className="navigation-ai-panel-frame"
    >
      <div className="navigation-ai-panel">
        <button aria-label={`切换到${surface.modeBackLabel}`} type="button" onClick={onClose} className="navigation-ai-mode-switch">
          <Magnifier aria-hidden="true" />
          <span>{surface.modeBackLabel}</span>
        </button>

        <div className="navigation-ai-command-stage">
          <SearchComposer
            inputLabel={surface.inputLabel}
            inputRef={inputRef}
            pending={pending}
            placeholder={surface.placeholder}
            value={value}
            onChange={setValue}
            onSubmit={submit}
          />
        </div>
      </div>

      {error
        ? (
            <p role="alert" className="navigation-ai-error">
              <CircleInfo aria-hidden="true" />
              <span>{error}</span>
            </p>
          )
        : null}

      {populated
        ? (
            <div data-state={panelState} className="navigation-ai-results-popover">
              <header className="navigation-ai-query-bar">
                <div>
                  <span>{surface.assistantLabel}</span>
                  <p title={lastQuery}>{lastQuery}</p>
                </div>
                {result ? <button type="button" disabled={pending} onClick={reset}>清空结果</button> : null}
              </header>

              <div aria-live="polite" className="navigation-ai-results-scroll">
                {pending && !result
                  ? <SearchProgress label={surface.progressLabel} />
                  : result
                    ? (
                        <SearchResult
                          pending={pending}
                          pendingRefinement={pendingRefinement}
                          result={result}
                          resultsAriaLabel={surface.resultsAriaLabel}
                          onRefine={prompt => void submit(prompt, 'refinement')}
                        />
                      )
                    : null}
                {pending && result ? <SearchProgress compact label="正在调整结果" /> : null}
              </div>
            </div>
          )
        : null}
    </section>
  )
}

function compactHistory(messages: CatalogAiMessage[]) {
  const compacted: CatalogAiMessage[] = []
  let totalLength = 0

  for (const message of messages.slice(-8).reverse()) {
    if (compacted.length > 0 && totalLength + message.content.length > 3_500)
      break
    compacted.push({ content: message.content, role: message.role })
    totalLength += message.content.length
  }

  return compacted.reverse()
}

function ResultLink({ index, item }: { index: number, item: CatalogAiResultItem }) {
  const content = (
    <>
      <span aria-hidden="true" className="navigation-ai-result-index">{String(index).padStart(2, '0')}</span>
      <span className="navigation-ai-result-logo">
        {item.image
          ? (
              <img
                alt=""
                decoding="async"
                height="36"
                loading="lazy"
                src={item.image}
                width="36"
              />
            )
          : <span aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</span>}
      </span>
      <span className="navigation-ai-result-copy">
        <span className="navigation-ai-result-title">
          <strong>{item.title}</strong>
          <small>{item.vpn ? '需 VPN' : item.kind}</small>
        </span>
        <span>{item.description || item.meta.join(' · ') || '打开查看详情'}</span>
      </span>
      <ArrowUpRightFromSquare aria-hidden="true" className="navigation-ai-result-arrow" />
    </>
  )

  if (item.external) {
    return (
      <a
        href={item.href}
        rel="noopener noreferrer"
        target="_blank"
        onClick={() => {
          if (item.visitId)
            recordWebsiteVisit(item.visitId)
        }}
        className="navigation-ai-result"
      >
        {content}
      </a>
    )
  }

  return (
    <ConfigurableDetailLink href={item.href} className="navigation-ai-result">
      {content}
    </ConfigurableDetailLink>
  )
}

function SearchComposer({
  inputRef,
  inputLabel,
  onChange,
  onSubmit,
  pending,
  placeholder,
  value,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  inputLabel: string
  onChange: (value: string) => void
  onSubmit: (value: string) => Promise<void>
  pending: boolean
  placeholder: string
  value: string
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(value)
      }}
      className="navigation-ai-command"
    >
      <textarea
        ref={inputRef}
        aria-label={inputLabel}
        autoComplete="off"
        enterKeyHint="send"
        maxLength={500}
        placeholder={placeholder}
        rows={1}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void onSubmit(value)
          }
        }}
      />
      <button
        aria-label={pending ? 'AI 正在检索' : '开始 AI 检索'}
        type="submit"
        disabled={!value.trim() || pending}
        className="navigation-ai-send"
      >
        <PaperPlane aria-hidden="true" />
      </button>
    </form>
  )
}

function SearchProgress({ compact = false, label }: { compact?: boolean, label: string }) {
  return (
    <div data-compact={compact ? 'true' : 'false'} className="navigation-ai-progress">
      <span aria-hidden="true" className="navigation-ai-progress-orbit">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  )
}

function SearchResult({ onRefine, pending, pendingRefinement, result, resultsAriaLabel }: {
  onRefine: (prompt: string) => void
  pending: boolean
  pendingRefinement: string
  result: CatalogAiResponse
  resultsAriaLabel: string
}) {
  return (
    <div className="navigation-ai-result-view">
      <p className="navigation-ai-answer">{result.answer}</p>

      {result.results.length
        ? (
            <ol aria-label={resultsAriaLabel} className="navigation-ai-result-list">
              {result.results.map((item, index) => (
                <li key={item.id}>
                  <ResultLink index={index + 1} item={item} />
                </li>
              ))}
            </ol>
          )
        : null}

      {result.suggestions.length
        ? (
            <div className="navigation-ai-refinements">
              {result.suggestions.map(suggestion => (
                <button key={suggestion} aria-busy={pendingRefinement === suggestion} type="button" disabled={pending} onClick={() => onRefine(suggestion)}>
                  <span>{pendingRefinement === suggestion ? '正在细化结果…' : suggestion}</span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          )
        : null}
    </div>
  )
}

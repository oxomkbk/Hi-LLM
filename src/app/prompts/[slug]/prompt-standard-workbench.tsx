'use client'

/* User-managed private assets must retain their prompt-scoped URL and no-store policy. */
/* eslint-disable next/no-img-element */

import { Check, Copy, File, Filmstrip, Picture } from '@gravity-ui/icons'
import { Button, toast } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import detailStyles from '@/components/catalog/detail-page.module.css'
import MarkdownRenderer from '@/components/content/markdown-renderer'
import {
  defaultPromptDocumentMode,
  getPromptDocumentPresentation,
  getPromptPreviewKind,
  promptDocumentLabel,
  resolvePromptDetailLayout,
  selectPrimaryPromptPreview,
  selectPromptPreviewAssets,
  supportsPromptDocumentReading,
} from '@/lib/prompts/detail-presentation'

import type { IResponse, PromptAsset, PromptDetailView, PromptDocument, PromptDocumentSummary } from '@/types'
import type { KeyboardEvent, ReactNode } from 'react'

export default function PromptStandardWorkbench({ prompt }: { prompt: PromptDetailView }) {
  const previewAssets = selectPromptPreviewAssets(prompt.assets)
  const attachmentAssets = prompt.assets.filter(asset => ['attachment', 'source_package'].includes(asset.role) && asset.url)
  const primaryAsset = selectPrimaryPromptPreview(prompt.assets)
  const primaryDocument = prompt.documents.find(document => document.is_primary) ?? prompt.documents[0] ?? null
  const initialDocument = prompt.initial_document?.id === primaryDocument?.id ? prompt.initial_document : null
  const [selectedAssetId, setSelectedAssetId] = useState(primaryAsset?.id ?? '')
  const [selectedDocumentId, setSelectedDocumentId] = useState(primaryDocument?.id ?? '')
  const [documentMode, setDocumentMode] = useState(() => defaultPromptDocumentMode(primaryDocument))
  const [loadedDocuments, setLoadedDocuments] = useState<Record<string, PromptDocument>>(() => initialDocument ? { [initialDocument.id]: initialDocument } : {})
  const [loadingDocumentId, setLoadingDocumentId] = useState('')
  const [failedDocumentId, setFailedDocumentId] = useState('')
  const [copied, setCopied] = useState(false)
  const copyResetTimerRef = useRef<number | null>(null)
  const selectedAsset = previewAssets.find(asset => asset.id === selectedAssetId) ?? primaryAsset
  const selectedDocumentSummary = prompt.documents.find(document => document.id === selectedDocumentId) ?? primaryDocument
  const selectedDocument = selectedDocumentSummary ? loadedDocuments[selectedDocumentSummary.id] ?? null : null
  const hasPreview = previewAssets.length > 0
  const layout = resolvePromptDetailLayout(prompt.content_kind, hasPreview)
  const canRenderDocument = supportsPromptDocumentReading(selectedDocumentSummary)
  const documentPresentation = selectedDocumentSummary ? getPromptDocumentPresentation(selectedDocumentSummary) : null

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null)
      window.clearTimeout(copyResetTimerRef.current)
  }, [])

  const copy = async () => {
    if (!selectedDocument)
      return
    try {
      await navigator.clipboard.writeText(selectedDocument.content)
      if (copyResetTimerRef.current !== null)
        window.clearTimeout(copyResetTimerRef.current)
      setCopied(true)
      toast.success(`${documentPresentation?.title ?? '内容'}已复制`)
      copyResetTimerRef.current = window.setTimeout(setCopied, 1600, false)
    }
    catch {
      toast.danger('复制失败，请在源码视图中手动复制')
    }
  }

  const loadDocument = async (next: PromptDocumentSummary) => {
    if (loadedDocuments[next.id])
      return
    setLoadingDocumentId(next.id)
    setFailedDocumentId('')
    try {
      const response = await fetch(`/api/public/prompts/${encodeURIComponent(prompt.slug)}/documents/${encodeURIComponent(next.id)}`)
      const payload = await response.json() as IResponse<PromptDocument | null>
      if (!response.ok || !payload.data)
        throw new Error(payload.msg || 'Prompt 文件加载失败')
      setLoadedDocuments(current => ({ ...current, [next.id]: payload.data! }))
    }
    catch {
      setFailedDocumentId(next.id)
    }
    finally {
      setLoadingDocumentId(current => current === next.id ? '' : current)
    }
  }

  const selectDocument = (next: PromptDocumentSummary) => {
    setSelectedDocumentId(next.id)
    setDocumentMode(defaultPromptDocumentMode(next))
    setCopied(false)
    void loadDocument(next)
  }

  const moveDocumentFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    const last = prompt.documents.length - 1
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight'
          ? (index + 1) % prompt.documents.length
          : (index - 1 + prompt.documents.length) % prompt.documents.length
    const next = prompt.documents[nextIndex]
    if (!next)
      return
    selectDocument(next)
    window.requestAnimationFrame(() => window.document.getElementById(documentTabId(next.id))?.focus())
  }

  const documentPanel = (
    <section
      aria-labelledby="prompt-documents-title"
      data-tone={documentPresentation?.tone ?? 'reading'}
      className={detailStyles.documentPane}
    >
      <header className={detailStyles.promptDocumentHeader}>
        <div className={detailStyles.promptDocumentHeading}>
          <span className={detailStyles.documentEyebrow}>{documentPresentation?.eyebrow ?? '内容'}</span>
          <h2 id="prompt-documents-title">{documentPresentation?.title ?? 'Prompt 内容'}</h2>
          <p>{documentPresentation?.description ?? '查看并复制当前内容。'}</p>
        </div>
        {selectedDocumentSummary
          ? (
              <Button size="sm" variant="primary" isDisabled={!selectedDocument} onPress={() => void copy()} className={detailStyles.documentCopyButton}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? '已复制' : documentPresentation?.tone === 'instruction' ? '复制并使用' : '复制内容'}
              </Button>
            )
          : null}
      </header>

      {prompt.documents.length > 1
        ? (
            <div aria-label="选择 Prompt 内容" role="tablist" className={detailStyles.documentTabs}>
              {prompt.documents.map((document, index) => {
                const selected = document.id === selectedDocumentSummary?.id
                return (
                  <button
                    key={document.id}
                    aria-controls="prompt-document-panel"
                    aria-selected={selected}
                    id={documentTabId(document.id)}
                    role="tab"
                    type="button"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectDocument(document)}
                    onKeyDown={event => moveDocumentFocus(event, index)}
                    className={detailStyles.documentButton}
                  >
                    <span>{promptDocumentLabel(document)}</span>
                    <small>{document.language || 'text'}</small>
                  </button>
                )
              })}
            </div>
          )
        : null}

      <div className={detailStyles.documentToolbar}>
        <span>{selectedDocumentSummary?.name ?? '暂无内容'}</span>
        {canRenderDocument
          ? (
              <div aria-label="文档显示模式" role="group" className={detailStyles.modeSwitch}>
                <button aria-pressed={documentMode === 'reading'} type="button" onClick={() => setDocumentMode('reading')} className={detailStyles.modeButton}>易读</button>
                <button aria-pressed={documentMode === 'source'} type="button" onClick={() => setDocumentMode('source')} className={detailStyles.modeButton}>原文</button>
              </div>
            )
          : <span className={detailStyles.sourceModeLabel}>原文格式</span>}
      </div>

      <div
        aria-labelledby={prompt.documents.length > 1 && selectedDocumentSummary ? documentTabId(selectedDocumentSummary.id) : undefined}
        id="prompt-document-panel"
        role={prompt.documents.length > 1 ? 'tabpanel' : undefined}
        data-document-tone={documentPresentation?.tone ?? 'reading'}
        tabIndex={prompt.documents.length > 1 ? 0 : undefined}
        className={detailStyles.documentContent}
      >
        {selectedDocumentSummary && loadingDocumentId === selectedDocumentSummary.id
          ? <DocumentLoading />
          : selectedDocumentSummary && failedDocumentId === selectedDocumentSummary.id
            ? <DocumentLoadError onRetry={() => void loadDocument(selectedDocumentSummary)} />
            : selectedDocument
              ? selectedDocument.content.trim()
                ? documentMode === 'reading' && canRenderDocument
                  ? <MarkdownRenderer content={selectedDocument.content} demoteHeadings />
                  : <pre className={detailStyles.sourceContent}><code>{selectedDocument.content}</code></pre>
                : <p className={detailStyles.emptyDocument}>当前文件没有可阅读内容。</p>
              : <p className={detailStyles.emptyDocument}>暂无 Prompt 内容。</p>}
      </div>

      <footer className={detailStyles.documentFooter}>
        <span title={selectedDocumentSummary?.source_path}>{selectedDocumentSummary?.source_path ?? '未提供源文件'}</span>
        <span>{selectedDocument ? `${selectedDocument.content.length.toLocaleString('zh-CN')} 字符` : null}</span>
      </footer>

      {attachmentAssets.length
        ? (
            <div aria-label="附件与源包" className={detailStyles.attachmentShelf}>
              <span className={detailStyles.badge}>附件</span>
              {attachmentAssets.map(asset => (
                <a
                  key={asset.id}
                  title={asset.name}
                  href={asset.is_downloadable ? downloadUrl(asset) : asset.url}
                  rel="noopener noreferrer"
                  target={asset.is_downloadable ? undefined : '_blank'}
                  className={detailStyles.assetButton}
                >
                  <File aria-hidden="true" />
                  <span>{asset.name}</span>
                </a>
              ))}
            </div>
          )
        : null}
    </section>
  )

  const previewPanel = hasPreview
    ? (
        <section aria-labelledby="prompt-preview-title" className={detailStyles.previewPane}>
          <header className={detailStyles.paneHeader}>
            <div>
              <span className={detailStyles.documentEyebrow}>{previewEyebrow(prompt.content_kind)}</span>
              <h2 id="prompt-preview-title">{previewTitle(prompt.content_kind)}</h2>
            </div>
            <small>{`${previewAssets.length} 个资源`}</small>
          </header>
          <div data-kind={prompt.content_kind} className={detailStyles.previewStage}>
            {selectedAsset ? <AssetPreview key={selectedAsset.id} title={prompt.title} asset={selectedAsset} /> : null}
          </div>
          {previewAssets.length > 1
            ? (
                <div aria-label="选择预览资源" className={detailStyles.assetStrip}>
                  {previewAssets.map(asset => (
                    <button
                      key={asset.id}
                      aria-pressed={asset.id === selectedAsset?.id}
                      title={asset.name}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={detailStyles.assetButton}
                    >
                      <AssetIcon asset={asset} />
                      <span>{asset.name}</span>
                    </button>
                  ))}
                </div>
              )
            : null}
        </section>
      )
    : null

  return (
    <section
      aria-label="Prompt 内容"
      id="prompt-content"
      data-content-kind={prompt.content_kind}
      data-has-preview={String(hasPreview)}
      data-layout={layout}
      className={detailStyles.workspace}
    >
      {orderPanels(layout, previewPanel, documentPanel)}
    </section>
  )
}

function AssetIcon({ asset }: { asset: PromptAsset }) {
  if (asset.role === 'video')
    return <Filmstrip aria-hidden="true" />
  if (['cover', 'image', 'poster'].includes(asset.role))
    return <Picture aria-hidden="true" />
  return <File aria-hidden="true" />
}

function AssetPreview({ asset, title }: { asset: PromptAsset, title: string }) {
  const kind = getPromptPreviewKind(asset)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'failed' | 'loading' | 'ready'>('loading')

  useEffect(() => {
    if (kind !== 'web' || status !== 'loading')
      return
    const timeout = window.setTimeout(setStatus, 10_000, 'failed')
    return () => window.clearTimeout(timeout)
  }, [attempt, kind, status])

  if (!asset.url || !kind)
    return null

  const retry = () => {
    setStatus('loading')
    setAttempt(value => value + 1)
  }

  return (
    <div data-status={status} className={detailStyles.previewMediaShell}>
      {status === 'failed'
        ? (
            <div role="alert" className={detailStyles.previewFailure}>
              <Picture aria-hidden="true" />
              <strong>预览没有加载成功</strong>
              <p>你仍然可以查看和复制 Prompt 内容。</p>
              <Button size="sm" variant="secondary" onPress={retry}>重新加载</Button>
            </div>
          )
        : (
            <>
              {kind === 'web'
                ? (
                    <iframe
                      key={attempt}
                      title={`${title} 网页静态预览`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox=""
                      src={asset.url}
                      onError={() => setStatus('failed')}
                      onLoad={() => setStatus('ready')}
                    />
                  )
                : kind === 'video'
                  ? (
                      <video
                        key={attempt}
                        controls
                        playsInline
                        preload="metadata"
                        src={asset.url}
                        onError={() => setStatus('failed')}
                        onLoadedMetadata={() => setStatus('ready')}
                      />
                    )
                  : (
                      <img
                        key={attempt}
                        alt={asset.alt_text || title}
                        decoding="async"
                        height="900"
                        loading="eager"
                        src={asset.url}
                        width="1600"
                        onError={() => setStatus('failed')}
                        onLoad={() => setStatus('ready')}
                      />
                    )}
              {status === 'loading' ? <span aria-label="正在加载预览" className={detailStyles.previewLoader} /> : null}
            </>
          )}
    </div>
  )
}

function DocumentLoadError({ onRetry }: { onRetry: VoidFunction }) {
  return (
    <div role="alert" className={detailStyles.documentLoadError}>
      <div>
        <strong>这份内容没有加载成功</strong>
        <p>可能是网络短暂波动，其他内容不受影响。</p>
      </div>
      <Button size="sm" variant="secondary" onPress={onRetry}>重新加载</Button>
    </div>
  )
}

function DocumentLoading() {
  return (
    <div aria-live="polite" className={detailStyles.documentLoading}>
      <span aria-hidden="true" />
      <p>正在加载这份内容…</p>
    </div>
  )
}

function documentTabId(id: string) {
  return `prompt-document-tab-${id}`
}

function downloadUrl(asset: PromptAsset) {
  return `${asset.url}${asset.url?.includes('?') ? '&' : '?'}download=1`
}

function orderPanels(layout: 'instruction-first' | 'visual-first', preview: ReactNode, document: ReactNode) {
  return layout === 'visual-first'
    ? (
        <>
          {preview}
          {document}
        </>
      )
    : (
        <>
          {document}
          {preview}
        </>
      )
}

function previewEyebrow(kind: PromptDetailView['content_kind']) {
  if (kind === 'video')
    return '动态预览'
  if (kind === 'image')
    return '图像预览'
  if (kind === 'web_ui')
    return '界面预览'
  return '结果预览'
}

function previewTitle(kind: PromptDetailView['content_kind']) {
  if (kind === 'video')
    return '镜头效果'
  if (kind === 'image')
    return '画面参考'
  if (kind === 'web_ui')
    return '界面效果'
  return '输出参考'
}

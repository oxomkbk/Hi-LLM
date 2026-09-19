'use client'

import {
  Bars,
  ChevronRight,
  ChevronsCollapseUpRight,
  ChevronsExpandUpRight,
  Gear,
  Xmark,
} from '@gravity-ui/icons'
import Link from 'next/link'
import { useState } from 'react'

import styles from './editor-studio.module.css'

import type { ReactNode } from 'react'

export interface EditorStudioProps {
  actions?: ReactNode
  backHref: string
  backLabel?: string
  brand?: string
  brandHref?: string
  children: ReactNode
  completion?: { completed: number, total: number }
  documentLabel: string
  documentMeta?: ReactNode
  documentNavigation?: ReactNode
  documentHeader?: ReactNode
  focusMode?: boolean
  inspector?: ReactNode
  inspectorFooter?: ReactNode
  discardAction?: ReactNode
  inspectorTitle?: string
  leftRail: ReactNode
  onBack?: VoidFunction
  onFocusModeChange?: (focusMode: boolean) => void
  statusLabel?: string
  statusTone?: EditorStudioStatusTone
}

export type EditorStudioStatusTone = 'danger' | 'neutral' | 'saving' | 'success'

interface EditorStudioSectionProps {
  children: ReactNode
  defaultOpen?: boolean
  description?: string
  title: string
}

export function EditorStudio({
  actions,
  backHref,
  backLabel = '返回列表',
  brand = 'Editorial',
  brandHref = '/',
  children,
  completion,
  documentLabel,
  documentMeta,
  documentNavigation,
  documentHeader,
  focusMode = false,
  inspector,
  inspectorFooter,
  discardAction,
  inspectorTitle = '发布设置',
  leftRail,
  onBack,
  onFocusModeChange,
  statusLabel = '尚未修改',
  statusTone = 'neutral',
}: EditorStudioProps) {
  const [leftOpen, setLeftOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const closePanels = () => {
    setLeftOpen(false)
    setInspectorOpen(false)
  }

  return (
    <div data-editor-studio="true" data-editor-studio-mode="three-pane" data-focus-mode={focusMode || undefined} className={styles.studio}>
      <header data-editor-studio-topbar="true" className={styles.topBar}>
        <div className={styles.topLeft}>
          <Link aria-label="返回 Hi LLM" href={brandHref} className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark}>H</span>
            <span>{brand}</span>
          </Link>
          <nav aria-label="编辑器面包屑" className={styles.breadcrumbs}>
            {onBack
              ? <button type="button" onClick={onBack}>{backLabel}</button>
              : <Link href={backHref}>{backLabel}</Link>}
            <ChevronRight aria-hidden="true" />
            <strong>{documentLabel}</strong>
          </nav>
        </div>

        {documentNavigation ? <div className={styles.documentNavigation}>{documentNavigation}</div> : null}

        <div className={styles.topRight}>
          {documentMeta ? <div className={styles.documentMeta}>{documentMeta}</div> : null}
          <span aria-live="polite" data-tone={statusTone} className={styles.status}>
            <i aria-hidden="true" />
            {statusLabel}
          </span>
          {completion
            ? (
                <span className={styles.completion}>
                  {completion.completed}
                  /
                  {completion.total}
                  {' '}
                  完成
                </span>
              )
            : null}
          {onFocusModeChange
            ? (
                <button aria-label={focusMode ? '退出专注模式' : '进入专注模式'} title={focusMode ? '退出专注模式' : '进入专注模式'} type="button" onClick={() => onFocusModeChange(!focusMode)} className={styles.topIconButton}>
                  {focusMode ? <ChevronsCollapseUpRight aria-hidden="true" /> : <ChevronsExpandUpRight aria-hidden="true" />}
                </button>
              )
            : null}
          <button
            aria-label="打开文档结构与区块" type="button" onClick={() => {
              setInspectorOpen(false)
              setLeftOpen(open => !open)
            }} className={styles.mobilePanelButton}
          >
            <Bars aria-hidden="true" />
          </button>
          <button
            aria-label="打开发布设置" type="button" onClick={() => {
              setLeftOpen(false)
              setInspectorOpen(open => !open)
            }} className={styles.mobilePanelButton}
          >
            <Gear aria-hidden="true" />
          </button>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      </header>

      <div data-editor-studio-layout="true" className={styles.layout}>
        <button aria-label="关闭编辑器侧栏" type="button" data-visible={leftOpen || inspectorOpen || undefined} onClick={closePanels} className={styles.backdrop} />
        <aside aria-label="文档结构与区块" data-editor-studio-region="outline" data-open={leftOpen || undefined} className={styles.leftRail}>
          {leftRail}
        </aside>

        <main aria-label="文档编辑区" data-editor-studio-region="canvas" className={styles.editorMain}>
          {documentHeader ? <div className={styles.documentIdentity}>{documentHeader}</div> : null}
          <div className={styles.editorBody}>{children}</div>
        </main>

        <aside aria-label="发布设置" data-editor-studio-region="inspector" data-open={inspectorOpen || undefined} className={styles.inspector}>
          <header className={styles.inspectorHeader}>
            <strong>{inspectorTitle}</strong>
            <button aria-label="关闭发布设置" type="button" onClick={() => setInspectorOpen(false)} className={styles.inspectorClose}>
              <Xmark aria-hidden="true" />
            </button>
          </header>
          <div className={styles.inspectorBody}>{inspector}</div>
          {inspectorFooter || discardAction
            ? (
                <footer className={styles.inspectorFooter}>
                  {discardAction ? <div className={styles.discardAction}>{discardAction}</div> : null}
                  {inspectorFooter}
                </footer>
              )
            : null}
        </aside>
      </div>
    </div>
  )
}

export function EditorStudioDocumentHeader({ children }: { children: ReactNode }) {
  return <div className={styles.documentHeader}>{children}</div>
}

export function EditorStudioSection({ children, defaultOpen = true, description, title }: EditorStudioSectionProps) {
  return (
    <details open={defaultOpen} className={styles.settingSection}>
      <summary>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </summary>
      <div className={styles.settingSectionBody}>{children}</div>
    </details>
  )
}

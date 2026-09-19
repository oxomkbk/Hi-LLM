'use client'

import {
  FileCode,
  Heading2,
  ListUl,
  Minus,
  Picture,
  QuoteOpen,
  Text,
} from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useMemo, useState } from 'react'

import { getSaveStateLabel } from './editor-model'
import styles from './editor-workbench.module.css'

import type { EditorBlockType } from './editor-blocks'
import type { EditorOutlineItem, EditorSaveState } from './editor-model'
import type { ReactNode } from 'react'

export type { EditorBlockType } from './editor-blocks'

export interface EditorWorkbenchHeaderProps {
  characterCount: number
  label: string
  modeLabel?: string
  modeSwitch?: ReactNode
  onSaveShortcut?: () => void
  readingMinutes?: number
  saveState?: EditorSaveState
  wordCount: number
}

interface EditorOutlineProps {
  activeId?: string | null
  items: EditorOutlineItem[]
  onInsertBlock?: (type: EditorBlockType) => void
  onSelect?: (item: EditorOutlineItem) => void
}

const BLOCKS: { group: '基础区块' | '媒体区块', icon: typeof Text, label: string, type: EditorBlockType }[] = [
  { group: '基础区块', icon: Heading2, label: '标题', type: 'heading' },
  { group: '基础区块', icon: Text, label: '文本', type: 'paragraph' },
  { group: '基础区块', icon: QuoteOpen, label: '引用', type: 'quote' },
  { group: '基础区块', icon: ListUl, label: '列表', type: 'list' },
  { group: '媒体区块', icon: Picture, label: '图片', type: 'image' },
  { group: '媒体区块', icon: FileCode, label: '代码', type: 'code' },
  { group: '媒体区块', icon: Minus, label: '分割线', type: 'divider' },
]

export function EditorOutline({ activeId, items, onInsertBlock, onSelect }: EditorOutlineProps) {
  const [view, setView] = useState<'blocks' | 'outline'>('outline')
  const [outlineQuery, setOutlineQuery] = useState('')
  const [blockQuery, setBlockQuery] = useState('')
  const filteredItems = useMemo(() => {
    const normalized = outlineQuery.trim().toLocaleLowerCase()
    return normalized ? items.filter(item => item.text.toLocaleLowerCase().includes(normalized)) : items
  }, [items, outlineQuery])
  const filteredBlocks = useMemo(() => {
    const normalized = blockQuery.trim().toLocaleLowerCase()
    return normalized ? BLOCKS.filter(block => block.label.toLocaleLowerCase().includes(normalized)) : BLOCKS
  }, [blockQuery])
  const blockGroups = useMemo(() => (['基础区块', '媒体区块'] as const).map(group => ({
    blocks: filteredBlocks.filter(block => block.group === group),
    label: group,
  })).filter(group => group.blocks.length > 0), [filteredBlocks])

  return (
    <nav aria-label="文档结构" className={`${styles.outline} authoring-editor-outline`}>
      <div aria-label="编辑器侧栏视图" role="tablist" className={styles.sidebarTabs}>
        <button
          aria-controls="editor-outline-view"
          aria-selected={view === 'outline'}
          id="editor-outline-tab"
          role="tab"
          type="button"
          onClick={() => setView('outline')}
        >
          大纲
        </button>
        {onInsertBlock
          ? (
              <button
                aria-controls="editor-blocks-view"
                aria-selected={view === 'blocks'}
                id="editor-blocks-tab"
                role="tab"
                type="button"
                onClick={() => setView('blocks')}
              >
                区块
              </button>
            )
          : null}
      </div>
      <div className={styles.sidebarContent}>
        <label className={styles.sidebarSearch}>
          <span className="sr-only">{view === 'outline' ? '搜索文章内容' : '搜索区块'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m20 20-4.4-4.4m2.1-5.1a7.2 7.2 0 1 1-14.4 0 7.2 7.2 0 0 1 14.4 0Z" /></svg>
          <input
            aria-controls={view === 'outline' ? 'editor-outline-view' : 'editor-blocks-view'}
            placeholder={view === 'outline' ? '搜索文章内容…' : '搜索区块…'}
            value={view === 'outline' ? outlineQuery : blockQuery}
            onChange={event => view === 'outline' ? setOutlineQuery(event.target.value) : setBlockQuery(event.target.value)}
          />
        </label>
        {view === 'outline'
          ? (
              <div aria-labelledby="editor-outline-tab" id="editor-outline-view" role="tabpanel">
                <div className={styles.outlineHeading}>
                  <span>文档结构</span>
                  <small>
                    {items.length}
                    {' '}
                    个标题
                  </small>
                </div>
                {filteredItems.length
                  ? (
                      <ol>
                        {filteredItems.map(item => (
                          <li key={item.id} data-active={item.id === activeId || undefined} data-level={item.level}>
                            <button aria-current={item.id === activeId ? 'location' : undefined} title={item.text} type="button" onClick={() => onSelect?.(item)}>
                              {item.text}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )
                  : <p className={styles.outlineEmpty}>{outlineQuery ? '没有匹配的标题。' : '开始输入标题，大纲将在此自动生成。'}</p>}
              </div>
            )
          : (
              <div aria-labelledby="editor-blocks-tab" id="editor-blocks-view" role="tabpanel">
                {blockGroups.length
                  ? blockGroups.map(group => (
                      <section key={group.label} className={styles.blockGroup}>
                        <div className={styles.outlineHeading}><span>{group.label}</span></div>
                        <div className={styles.blockGrid}>
                          {group.blocks.map(block => (
                            <button key={block.type} aria-label={`插入${block.label}区块`} type="button" onClick={() => onInsertBlock?.(block.type)} className={styles.blockCard}>
                              <block.icon aria-hidden="true" />
                              <span>{block.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))
                  : <p className={styles.outlineEmpty}>{blockQuery ? '没有匹配的区块。' : '当前没有可用区块。'}</p>}
              </div>
            )}
      </div>
    </nav>
  )
}

export function EditorWorkbenchHeader({ characterCount, label, modeLabel, modeSwitch, onSaveShortcut, readingMinutes, saveState = 'idle', wordCount }: EditorWorkbenchHeaderProps) {
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘S' : 'Ctrl+S'
  return (
    <header data-save-state={saveState} data-workbench-header className={`${styles.header} authoring-editor-header`}>
      <div className={styles.identity}>
        <span aria-hidden="true" className={styles.statusDot} />
        <div>
          <strong>{label}</strong>
          <span>{modeLabel ?? '专业写作工作台'}</span>
        </div>
      </div>
      <div className={`${styles.headerActions} authoring-editor-header-actions`}>
        <div aria-label="文档状态" className={styles.meta}>
          <span aria-live="polite" data-save-state={saveState} className={styles.saveState}>
            <i aria-hidden="true" />
            {getSaveStateLabel(saveState)}
          </span>
          <span className={styles.metric}>
            {wordCount.toLocaleString('zh-CN')}
            {' '}
            词
          </span>
          <span className={styles.metric}>
            {characterCount.toLocaleString('zh-CN')}
            {' '}
            字
          </span>
          <span className={styles.metric}>
            {readingMinutes ?? Math.max(1, Math.ceil(wordCount / 400))}
            {' '}
            分钟阅读
          </span>
        </div>
        <div className={`${styles.controls} authoring-editor-controls`}>
          {modeSwitch}
          {onSaveShortcut
            ? (
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  isDisabled={saveState === 'saving'}
                  onPress={onSaveShortcut}
                  className={styles.saveButton}
                >
                  保存
                  <kbd>{shortcut}</kbd>
                </Button>
              )
            : null}
        </div>
      </div>
    </header>
  )
}

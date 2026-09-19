'use client'

/* eslint-disable perfectionist/sort-modules, react-refresh/only-export-components */

import {
  ArrowRotateLeft,
  ArrowRotateRight,
  Bold,
  ChevronsCollapseUpRight,
  ChevronsExpandUpRight,
  Code,
  FileCode,
  Italic,
  LayoutCells,
  Link,
  ListCheck,
  ListOl,
  ListUl,
  Minus,
  Palette,
  Picture,
  QuoteOpen,
  Strikethrough,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  Underline,
} from '@gravity-ui/icons'
import { toast } from '@heroui/react'
import Highlight from '@tiptap/extension-highlight'
import TiptapImage from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { looksLikeMarkdown } from '../../lib/content/markdown'
import { uploadWonderlandImage } from '../../lib/wonderland/client-upload'
import { TIPTAP_BACKGROUND_COLORS, TIPTAP_TEXT_COLORS, TIPTAP_TEXT_SIZES } from '../../lib/wonderland/tiptap-document'
import { getEditorBlockInsertion } from '../authoring/editor-blocks'
import { EditorToolButton } from '../authoring/editor-controls'
import { buildEditorOutline, buildMarkdownOutline, countEditorWords, getMarkdownHeadingIndexAtOffset, getReadingTimeMinutes } from '../authoring/editor-model'
import { EditorStudio } from '../authoring/editor-studio'
import { EditorOutline, EditorWorkbenchHeader } from '../authoring/editor-workbench'
import MediaPicker from '../media/media-picker'
import styles from './markdown-editor.module.css'

import type { EditorStudioProps } from '../authoring/editor-studio'
import type { EditorBlockType } from '../authoring/editor-workbench'
import type { MediaPickerItem } from '../media/media-picker'
import type { Editor } from '@tiptap/react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, SVGProps } from 'react'

export interface MarkdownEditorProps {
  className?: string
  documentHeader?: ReactNode
  defaultValue?: string
  id?: string
  label?: string
  maxLength?: number
  minRows?: number
  name?: string
  onChange?: (value: string) => void
  onSaveShortcut?: () => void
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  saveState?: 'error' | 'idle' | 'saved' | 'saving'
  sourceOnly?: boolean
  studio?: Omit<EditorStudioProps, 'children' | 'focusMode' | 'leftRail' | 'documentHeader' | 'documentMeta'>
  value?: string
}

type EditorMode = 'visual' | 'source'
type MarkdownSourceFeature = 'heading' | 'html'
type PasteState = 'markdown' | 'protected' | 'rich-text' | null

const SOURCE_FEATURE_LABELS: Record<MarkdownSourceFeature, string> = {
  heading: '五、六级或 Setext 标题',
  html: 'HTML 片段',
}

const MARKDOWN_UNSUPPORTED_ATX_HEADING = /^\s{0,3}#{5,6}(?:\s+|$)/m
const MARKDOWN_UNSUPPORTED_SETEXT_HEADING = /^\s*\S.*\n\s*=+\s*$/m

export function inspectMarkdownCompatibility(value: string) {
  const markdown = maskMarkdownCode(value)
  const features: MarkdownSourceFeature[] = []

  if (MARKDOWN_UNSUPPORTED_ATX_HEADING.test(markdown) || MARKDOWN_UNSUPPORTED_SETEXT_HEADING.test(markdown))
    features.push('heading')
  if (hasRawHtml(markdown))
    features.push('html')

  return {
    features,
    labels: features.map(feature => SOURCE_FEATURE_LABELS[feature]),
    requiresSource: features.length > 0,
  }
}

export function insertProtectedMarkdownAtSelection(editor: Editor, markdown: string) {
  const current = editor.getMarkdown()
  let placeholder = 'HILLMNAVPROTECTEDPASTETOKEN'
  while (current.includes(placeholder) || markdown.includes(placeholder))
    placeholder += 'X'

  try {
    const { from, to } = editor.state.selection
    const stagedDocument = editor.state.tr
      .replaceWith(from, to, editor.state.schema.text(placeholder))
      .doc
    const stagedMarkdown = editor.markdown?.serialize(stagedDocument.toJSON()) ?? ''
    const insertionOffset = stagedMarkdown.indexOf(placeholder)
    if (insertionOffset >= 0) {
      return {
        cursor: insertionOffset + markdown.length,
        value: `${stagedMarkdown.slice(0, insertionOffset)}${markdown}${stagedMarkdown.slice(insertionOffset + placeholder.length)}`,
      }
    }
  }
  catch {
    // A rare node selection can reject text replacement; the source fallback still preserves the clipboard payload.
  }

  const separator = current.trim() && markdown.trim() ? '\n\n' : ''
  return { cursor: current.length + separator.length + markdown.length, value: `${current}${separator}${markdown}` }
}

export function resolveMarkdownLengthEdit(previous: string, next: string, maxLength: number) {
  if (next.length <= maxLength || (previous.length > maxLength && next.length < previous.length)) {
    return { accepted: true, value: next }
  }

  return { accepted: false, value: previous }
}

function hasRawHtml(value: string) {
  return value.includes('<!--')
    || /<![A-Z]/.test(value)
    || value.includes('<?')
    || /<\/?[a-z][a-z\d:-]*(?:\s|\/?>)/i.test(value)
}

function maskMarkdownCode(value: string) {
  let fence: { marker: '`' | '~', size: number } | null = null

  return value.split('\n').map((line) => {
    const trimmed = line.trim()
    if (fence) {
      const closing = /^(`+|~+)$/.exec(trimmed)?.[1]
      if (closing?.[0] === fence.marker && closing.length >= fence.size)
        fence = null
      return ''
    }

    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (opening) {
      fence = { marker: opening[0] as '`' | '~', size: opening.length }
      return ''
    }

    if (/^(?: {4}|\t)/.test(line))
      return ''

    return maskMarkdownInlineCode(line)
  }).join('\n')
}

function maskMarkdownInlineCode(line: string) {
  let cursor = 0
  let masked = ''

  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      masked += line[cursor]
      cursor += 1
      continue
    }

    const openingStart = cursor
    while (line[cursor] === '`')
      cursor += 1
    const marker = line.slice(openingStart, cursor)
    const closingStart = line.indexOf(marker, cursor)
    if (closingStart < 0) {
      masked += marker
      continue
    }

    const closingEnd = closingStart + marker.length
    masked += ' '.repeat(closingEnd - openingStart)
    cursor = closingEnd
  }

  return masked
}

export default function MarkdownEditor({
  className = '',
  defaultValue = '',
  id,
  label = 'Markdown 内容',
  maxLength = 2_097_152,
  minRows = 8,
  name,
  onChange,
  onSaveShortcut,
  placeholder = '支持 Markdown，可直接粘贴标题、列表、链接与代码块…',
  readOnly = false,
  required = false,
  saveState = 'idle',
  sourceOnly = false,
  studio,
  documentHeader,
  value,
}: MarkdownEditorProps) {
  const initialValue = value ?? defaultValue
  const initialCompatibility = inspectMarkdownCompatibility(initialValue)
  const [internalValue, setInternalValue] = useState(initialValue)
  const [mode, setMode] = useState<EditorMode>(() => sourceOnly || initialCompatibility.requiresSource ? 'source' : 'visual')
  const [pasteState, setPasteState] = useState<PasteState>(null)
  const [limitAttempted, setLimitAttempted] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [imageProgress, setImageProgress] = useState<number | null>(null)
  const [sourceCursor, setSourceCursor] = useState(0)
  const contentRef = useRef(initialValue)
  const controlledValueRef = useRef(value)
  const editorRef = useRef<Editor | null>(null)
  const isControlledRef = useRef(value !== undefined)
  const lastEditorValueRef = useRef(initialCompatibility.requiresSource ? '' : initialValue)
  const maxLengthRef = useRef(maxLength)
  const modeRef = useRef(mode)
  const onChangeRef = useRef(onChange)
  const onSaveShortcutRef = useRef(onSaveShortcut)
  const pasteTimerRef = useRef<number | null>(null)
  const reconcileFrameRef = useRef<number | null>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const content = value ?? internalValue
  const compatibility = useMemo(() => inspectMarkdownCompatibility(content), [content])
  const displayMode: EditorMode = sourceOnly || compatibility.requiresSource ? 'source' : mode

  contentRef.current = content
  controlledValueRef.current = value
  isControlledRef.current = value !== undefined
  maxLengthRef.current = maxLength
  modeRef.current = displayMode

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveShortcutRef.current = onSaveShortcut
  }, [onSaveShortcut])

  useEffect(() => () => {
    if (pasteTimerRef.current !== null)
      window.clearTimeout(pasteTimerRef.current)
    if (reconcileFrameRef.current !== null)
      window.cancelAnimationFrame(reconcileFrameRef.current)
  }, [])

  useEffect(() => {
    if (!focusMode)
      return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setFocusMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusMode])

  const scheduleControlledReconcile = useCallback(() => {
    if (!isControlledRef.current)
      return
    if (reconcileFrameRef.current !== null)
      window.cancelAnimationFrame(reconcileFrameRef.current)

    reconcileFrameRef.current = window.requestAnimationFrame(() => {
      reconcileFrameRef.current = null
      const authoritative = controlledValueRef.current
      if (authoritative === undefined)
        return

      contentRef.current = authoritative
      if (sourceRef.current && sourceRef.current.value !== authoritative)
        sourceRef.current.value = authoritative

      const nextCompatibility = inspectMarkdownCompatibility(authoritative)
      if (nextCompatibility.requiresSource) {
        setMode('source')
        return
      }

      const currentEditor = editorRef.current
      if (modeRef.current === 'visual' && currentEditor && !currentEditor.isDestroyed && currentEditor.getMarkdown() !== authoritative)
        currentEditor.commands.setContent(authoritative, { contentType: 'markdown', emitUpdate: false })
      lastEditorValueRef.current = authoritative
    })
  }, [])

  const commit = useCallback((next: string, previous = contentRef.current) => {
    const result = resolveMarkdownLengthEdit(previous, next, maxLengthRef.current)
    setLimitAttempted(!result.accepted || result.value.length > maxLengthRef.current)
    if (!result.accepted)
      return result

    contentRef.current = result.value
    if (!isControlledRef.current) {
      setInternalValue(result.value)
    }
    onChangeRef.current?.(result.value)
    scheduleControlledReconcile()
    return result
  }, [scheduleControlledReconcile])

  const showPasteState = useCallback((state: Exclude<PasteState, null>) => {
    setPasteState(state)
    if (pasteTimerRef.current !== null)
      window.clearTimeout(pasteTimerRef.current)
    pasteTimerRef.current = window.setTimeout(() => {
      setPasteState(null)
      pasteTimerRef.current = null
    }, 2600)
  }, [])

  const insertSourceMarkdown = useCallback((markdown: string, selection?: { end: number, start: number }) => {
    const current = contentRef.current
    const source = sourceRef.current
    const currentEditor = editorRef.current
    const insertion = displayMode === 'source' && source
      ? {
          cursor: source.selectionStart + markdown.length,
          value: `${current.slice(0, source.selectionStart)}${markdown}${current.slice(source.selectionEnd)}`,
        }
      : currentEditor
        ? insertProtectedMarkdownAtSelection(currentEditor, markdown)
        : { cursor: current.length + markdown.length, value: `${current}${markdown}` }
    const result = commit(insertion.value, current)
    if (!result.accepted)
      return

    setMode('source')
    showPasteState(inspectMarkdownCompatibility(markdown).requiresSource ? 'protected' : 'markdown')
    window.requestAnimationFrame(() => {
      sourceRef.current?.focus()
      const start = selection ? insertion.cursor - markdown.length + selection.start : insertion.cursor
      const end = selection ? insertion.cursor - markdown.length + selection.end : insertion.cursor
      sourceRef.current?.setSelectionRange(start, end)
    })
  }, [commit, displayMode, showPasteState])

  const formatSourceSelection = useCallback((before: string, after = before, placeholderText = '文本') => {
    const source = sourceRef.current
    if (!source)
      return
    const current = contentRef.current
    const selected = current.slice(source.selectionStart, source.selectionEnd) || placeholderText
    const replacement = `${before}${selected}${after}`
    const start = source.selectionStart
    const next = `${current.slice(0, start)}${replacement}${current.slice(source.selectionEnd)}`
    const result = commit(next, current)
    if (!result.accepted)
      return
    window.requestAnimationFrame(() => {
      sourceRef.current?.focus()
      sourceRef.current?.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }, [commit])

  const insertMarkdownImage = useCallback((name: string, src: string) => {
    if (readOnly)
      return
    const alt = name.replace(/\.[^.]+$/, '') || '图片'
    if (displayMode === 'visual' && editorRef.current) {
      editorRef.current.chain().focus().setImage({ alt, src }).run()
    }
    else {
      const markdown = `![${alt}](${src})`
      insertSourceMarkdown(markdown, { end: alt.length + 2, start: 2 })
    }
  }, [displayMode, insertSourceMarkdown, readOnly])

  const insertLibraryImage = useCallback((item: MediaPickerItem) => {
    insertMarkdownImage(item.name, item.url)
    toast.success('素材已插入正文')
  }, [insertMarkdownImage])

  const uploadMarkdownImage = useCallback(async (file: File) => {
    if (readOnly)
      return
    setImageProgress(0)
    try {
      const uploaded = await uploadWonderlandImage(file, percent => setImageProgress(percent))
      insertMarkdownImage(file.name, `/api/files/${uploaded.fileId}`)
      toast.success('图片已上传并插入正文')
    }
    catch (error) {
      toast.danger(error instanceof Error ? error.message : '图片上传失败，请稍后重试')
    }
    finally {
      setImageProgress(null)
      if (imageInputRef.current)
        imageInputRef.current.value = ''
    }
  }, [insertMarkdownImage, readOnly])

  const editor = useEditor({
    content: initialCompatibility.requiresSource ? '' : initialValue,
    contentType: 'markdown',
    editable: !readOnly,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        'aria-label': label,
        'aria-multiline': 'true',
        'aria-required': String(required),
        'data-placeholder': placeholder,
        'role': 'textbox',
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard || editorRef.current?.isEditable === false)
          return false

        const image = Array.from(clipboard.files).find(file => file.type.startsWith('image/'))
        if (image) {
          event.preventDefault()
          void uploadMarkdownImage(image)
          return true
        }

        const explicitMarkdown = clipboard.getData('text/markdown')
        const plainText = clipboard.getData('text/plain')
        const markdown = explicitMarkdown || plainText
        const pastedCompatibility = inspectMarkdownCompatibility(markdown)
        if (pastedCompatibility.requiresSource) {
          event.preventDefault()
          const currentEditor = editorRef.current
          const current = currentEditor?.getMarkdown() ?? contentRef.current
          const insertion = currentEditor
            ? insertProtectedMarkdownAtSelection(currentEditor, markdown)
            : { cursor: current.length + markdown.length, value: `${current}${markdown}` }
          const result = commit(insertion.value, current)
          if (result.accepted) {
            setMode('source')
            showPasteState('protected')
            window.requestAnimationFrame(() => {
              sourceRef.current?.focus()
              sourceRef.current?.setSelectionRange(insertion.cursor, insertion.cursor)
            })
          }
          return true
        }

        if (explicitMarkdown || looksLikeMarkdown(plainText)) {
          event.preventDefault()
          editorRef.current?.commands.insertContent(markdown, { contentType: 'markdown' })
          showPasteState('markdown')
          return true
        }

        if (clipboard.getData('text/html'))
          showPasteState('rich-text')
        return false
      },
      handleDrop: (_view, event) => {
        const image = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'))
        if (!image || editorRef.current?.isEditable === false)
          return false
        event.preventDefault()
        void uploadMarkdownImage(image)
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      TextStyleKit.configure({
        backgroundColor: {},
        fontFamily: false,
        lineHeight: false,
      }),
      Highlight,
      TextAlign.configure({
        alignments: ['left', 'center', 'right'],
        types: ['heading', 'paragraph'],
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: true },
      }),
      TiptapImage.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'markdown-editor-image' },
        inline: false,
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      const next = currentEditor.getMarkdown()
      const result = commit(next, lastEditorValueRef.current)
      if (result.accepted) {
        lastEditorValueRef.current = result.value
        return
      }

      queueMicrotask(() => {
        if (!currentEditor.isDestroyed)
          currentEditor.commands.setContent(result.value, { contentType: 'markdown', emitUpdate: false })
      })
    },
    shouldRerenderOnTransaction: false,
  })

  useEffect(() => {
    editorRef.current = editor
    editor?.setEditable(!readOnly)
    return () => {
      if (editorRef.current === editor)
        editorRef.current = null
    }
  }, [editor, readOnly])

  useEffect(() => {
    if (compatibility.requiresSource)
      return

    if (displayMode === 'visual' && editor && editor.getMarkdown() !== content)
      editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false })
    lastEditorValueRef.current = content
  }, [compatibility.requiresSource, content, displayMode, editor])

  const switchMode = (nextMode: EditorMode) => {
    if (sourceOnly)
      return
    if (nextMode === displayMode)
      return
    if (nextMode === 'visual') {
      if (compatibility.requiresSource)
        return
      if (editor && editor.getMarkdown() !== content)
        editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false })
      lastEditorValueRef.current = content
    }
    setMode(nextMode)
    requestAnimationFrame(() => {
      if (nextMode === 'visual')
        editor?.commands.focus('end')
    })
  }

  const editorMinHeight = `${Math.max(9, Math.min(minRows, 18)) * 1.55}rem`
  const editorStyle = { '--content-editor-min-height': editorMinHeight } as CSSProperties
  const overLimit = Math.max(0, content.length - maxLength)
  const remaining = maxLength - content.length
  const wordCount = countEditorWords(content)

  const visualEditorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor
      ? { activeHeadingIndex: getActiveHeadingIndex(currentEditor), outline: buildEditorOutline(currentEditor.getJSON()) }
      : { activeHeadingIndex: null, outline: [] },
  })
  const editorOutline = visualEditorState?.outline ?? []
  const outline = displayMode === 'source' ? buildMarkdownOutline(content) : editorOutline
  const activeHeadingIndex = displayMode === 'source'
    ? getMarkdownHeadingIndexAtOffset(content, sourceCursor)
    : visualEditorState?.activeHeadingIndex ?? null

  const focusHeading = (position: number) => {
    if (displayMode === 'source') {
      const source = sourceRef.current
      if (!source)
        return
      const lines = content.split('\n')
      let headingIndex = 0
      let offset = 0
      let fenced = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (/^(?:`{3,}|~{3,})/.test(trimmed)) {
          fenced = !fenced
        }
        else if (!fenced && /^\s{0,3}#{1,4}\s+/.test(line)) {
          if (headingIndex === position) {
            source.focus()
            source.setSelectionRange(offset, offset + line.length)
            return
          }
          headingIndex += 1
        }
        offset += line.length + 1
      }
      return
    }
    if (!editor)
      return
    let headingIndex = 0
    let targetPosition: number | null = null
    editor.state.doc.descendants((node, nodePosition) => {
      if (node.type.name !== 'heading')
        return
      if (headingIndex === position)
        targetPosition = nodePosition
      headingIndex += 1
    })
    if (targetPosition !== null)
      editor.chain().focus().setTextSelection(targetPosition + 1).scrollIntoView().run()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && focusMode) {
      event.preventDefault()
      setFocusMode(false)
      return
    }
    if (!readOnly && onSaveShortcutRef.current && event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onSaveShortcutRef.current?.()
    }
  }

  const onPickImageForInsert = () => {
    if (readOnly)
      return
    imageInputRef.current?.click()
  }

  const insertBlock = (type: EditorBlockType) => {
    if (displayMode === 'source') {
      if (type === 'image') {
        onPickImageForInsert()
        return
      }
      const insertion = getEditorBlockInsertion(type)
      insertSourceMarkdown(`\n\n${insertion.markdown}`)
      return
    }

    if (type === 'image') {
      onPickImageForInsert()
      return
    }
    if (!editor)
      return
    const insertion = getEditorBlockInsertion(type)
    editor.chain().focus().insertContent(insertion.node).createParagraphNear().run()
  }

  const modeSwitch = sourceOnly
    ? null
    : (
        <div aria-label="编辑模式" role="group" className={styles.modeSwitch}>
          <button
            aria-pressed={displayMode === 'visual'}
            title={compatibility.requiresSource ? '当前内容包含可视化编辑器不支持的语法，请使用 Markdown 源码模式' : undefined}
            type="button"
            disabled={compatibility.requiresSource}
            onClick={() => switchMode('visual')}
          >
            可视化
          </button>
          <button aria-pressed={displayMode === 'source'} type="button" onClick={() => switchMode('source')}>Markdown</button>
        </div>
      )

  const outlineNode = (
    <EditorOutline activeId={activeHeadingIndex === null ? null : `heading-${activeHeadingIndex + 1}`} items={outline} onInsertBlock={readOnly ? undefined : insertBlock} onSelect={item => focusHeading(item.position)} />
  )

  const toolbarNode = readOnly
    ? null
    : displayMode === 'visual'
      ? (
          <EditorToolbar
            editor={editor}
            focusMode={focusMode}
            imagePicker={(
              <MediaPicker
                title="选择正文图片"
                accept="image/jpeg,image/png,image/webp"
                kind="image"
                trigger={open => (
                  <ToolButton
                    disabled={!editor || imageProgress !== null}
                    icon={Picture}
                    label={imageProgress === null ? '插入图片' : `上传 ${imageProgress}%`}
                    onPress={open}
                  />
                )}
                onSelect={insertLibraryImage}
                onUpload={uploadWonderlandImage}
              />
            )}
            showFocusMode={!studio}
            onFocusModeChange={setFocusMode}
          />
        )
      : (
          <SourceToolbar
            focusMode={focusMode}
            imagePicker={(
              <MediaPicker
                title="选择正文图片"
                accept="image/jpeg,image/png,image/webp"
                kind="image"
                trigger={open => (
                  <EditorToolButton
                    disabled={imageProgress !== null}
                    icon={Picture}
                    label={imageProgress === null ? '插入图片' : `上传 ${imageProgress}%`}
                    onPress={open}
                  />
                )}
                onSelect={insertLibraryImage}
                onUpload={uploadWonderlandImage}
              />
            )}
            showFocusMode={!studio}
            onFocusModeChange={setFocusMode}
            onFormat={formatSourceSelection}
            onInsert={insertSourceMarkdown}
          />
        )

  const editableNode = displayMode === 'visual'
    ? <EditorContent editor={editor} className={`${styles.content} authoring-editor-content`} />
    : (
        <textarea
          ref={sourceRef}
          aria-label={`${label} Markdown 源码`}
          id={id}
          maxLength={content.length > maxLength ? undefined : maxLength}
          placeholder={placeholder}
          readOnly={readOnly}
          required={required}
          rows={minRows}
          value={content}
          onChange={event => commit(event.target.value)}
          onClick={event => setSourceCursor(event.currentTarget.selectionStart)}
          onDrop={(event) => {
            const image = Array.from(event.dataTransfer.files).find(file => file.type.startsWith('image/'))
            if (!image)
              return
            event.preventDefault()
            void uploadMarkdownImage(image)
          }}
          onKeyUp={event => setSourceCursor(event.currentTarget.selectionStart)}
          onPaste={(event) => {
            const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
            if (!image)
              return
            event.preventDefault()
            void uploadMarkdownImage(image)
          }}
          onSelect={event => setSourceCursor(event.currentTarget.selectionStart)}
          className={`${styles.source} authoring-editor-source`}
        />
      )

  const compatibilityNode = compatibility.requiresSource
    ? (
        <div aria-live="polite" role="status" className={styles.compatibilityNotice}>
          <strong>已启用源码保护</strong>
          <span>{`检测到${compatibility.labels.join('、')}。为避免格式或内容丢失，暂不允许切换可视化；移除这些语法后即可恢复。`}</span>
        </div>
      )
    : null

  const canvasNode = (
    <div className={`${styles.canvas} authoring-editor-workbench-canvas`}>
      {compatibilityNode}
      <div className={`${styles.canvasToolbar} authoring-editor-canvas-toolbar`}>
        {toolbarNode}
        {studio ? modeSwitch : null}
      </div>
      <div className="authoring-editor-document">
        {!studio && documentHeader ? <div className="authoring-editor-document-header">{documentHeader}</div> : null}
        {editableNode}
      </div>
    </div>
  )

  const hiddenFields = (
    <>
      {name ? <input name={name} type="hidden" value={content} /> : null}
      <input
        ref={imageInputRef}
        aria-hidden="true"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file)
            void uploadMarkdownImage(file)
        }}
        className={styles.hiddenInput}
      />
    </>
  )

  const footerNode = (
    <footer className={`${styles.footer} authoring-editor-footer`}>
      <span aria-live="polite" className={limitAttempted || overLimit > 0 ? styles.warning : undefined}>
        {overLimit > 0
          ? `当前超出上限 ${overLimit.toLocaleString('zh-CN')} 字符，可继续删除直至合规`
          : limitAttempted
            ? `已达到 ${maxLength.toLocaleString('zh-CN')} 字符上限，新增内容未写入`
            : pasteState === 'protected'
              ? '已切换源码模式，并在文末原样保留粘贴内容'
              : pasteState === 'markdown'
                ? '已识别并保留 Markdown 排版'
                : pasteState === 'rich-text'
                  ? '已保留网页中的标题、列表与链接'
                  : displayMode === 'visual'
                    ? '支持直接粘贴 Markdown 与网页富文本'
                    : '源码修改会实时同步到可视化编辑器'}
      </span>
      <span className={styles.documentStats}>
        <span>
          {wordCount.toLocaleString('zh-CN')}
          {' '}
          词
        </span>
        <span className={remaining < Math.min(100, maxLength * 0.05) ? styles.counterWarning : undefined}>
          {content.length.toLocaleString('zh-CN')}
          <span aria-hidden="true"> / </span>
          <span className="sr-only">字符，共可输入</span>
          {maxLength.toLocaleString('zh-CN')}
        </span>
      </span>
    </footer>
  )

  if (studio) {
    return (
      <section
        aria-label={`${label}编辑器`}
        data-read-only={readOnly || undefined}
        data-source-only={sourceOnly || undefined}
        data-source-protected={compatibility.requiresSource || undefined}
        data-studio="true"
        onKeyDownCapture={handleKeyDown}
        className={`markdown-editor authoring-editor-root ${styles.root} ${styles.studioRoot} ${className}`}
        style={editorStyle}
      >
        <EditorStudio
          {...studio}
          documentHeader={documentHeader}
          documentMeta={(
            <>
              <span aria-hidden="true" className="authoring-editor-document-avatar">H</span>
              <span>Hi LLM</span>
              <span aria-hidden="true">·</span>
              <span>
                {getReadingTimeMinutes(content)}
                {' '}
                分钟阅读
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {wordCount.toLocaleString('zh-CN')}
                {' '}
                字
              </span>
            </>
          )}
          focusMode={focusMode}
          leftRail={outlineNode}
          statusLabel={studio.statusLabel ?? (saveState === 'saved' ? '已保存' : saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失败' : '尚未保存')}
          statusTone={studio.statusTone ?? (saveState === 'saved' ? 'success' : saveState === 'saving' ? 'saving' : saveState === 'error' ? 'danger' : 'neutral')}
          onFocusModeChange={setFocusMode}
        >
          <div className={styles.studioCanvas}>
            {canvasNode}
            {footerNode}
          </div>
        </EditorStudio>
        {hiddenFields}
      </section>
    )
  }

  return (
    <section
      aria-label={`${label}编辑器`}
      data-focus-mode={focusMode || undefined}
      data-read-only={readOnly || undefined}
      data-source-only={sourceOnly || undefined}
      data-source-protected={compatibility.requiresSource || undefined}
      onKeyDownCapture={handleKeyDown}
      className={`markdown-editor authoring-editor-root ${styles.root} ${className}`}
      style={editorStyle}
    >
      <EditorWorkbenchHeader
        characterCount={content.length}
        label={label}
        modeLabel={readOnly ? '只读内容' : displayMode === 'visual' ? '所见即所得' : 'Markdown 源码'}
        modeSwitch={modeSwitch}
        readingMinutes={getReadingTimeMinutes(content)}
        saveState={saveState}
        wordCount={wordCount}
        onSaveShortcut={readOnly ? undefined : onSaveShortcut}
      />
      <div className={`${styles.workbenchBody} authoring-editor-workbench-body`}>
        {outlineNode}
        {canvasNode}
      </div>
      {hiddenFields}
      {footerNode}
    </section>
  )
}

function EditorToolbar({ editor, focusMode, imagePicker, onFocusModeChange, showFocusMode = true }: {
  editor: Editor | null
  focusMode: boolean
  imagePicker: ReactNode
  onFocusModeChange: (value: boolean) => void
  showFocusMode?: boolean
}) {
  const [linkError, setLinkError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor
      ? {
          blockquote: currentEditor.isActive('blockquote'),
          bold: currentEditor.isActive('bold'),
          bulletList: currentEditor.isActive('bulletList'),
          canRedo: currentEditor.can().redo(),
          canUndo: currentEditor.can().undo(),
          code: currentEditor.isActive('code'),
          codeBlock: currentEditor.isActive('codeBlock'),
          color: currentEditor.getAttributes('textStyle').color ?? '',
          heading: currentEditor.isActive('heading')
            ? Number(currentEditor.getAttributes('heading').level)
            : 0,
          highlight: currentEditor.isActive('highlight'),
          backgroundColor: currentEditor.getAttributes('textStyle').backgroundColor ?? '',
          italic: currentEditor.isActive('italic'),
          link: currentEditor.isActive('link'),
          orderedList: currentEditor.isActive('orderedList'),
          strike: currentEditor.isActive('strike'),
          table: currentEditor.isActive('table'),
          taskList: currentEditor.isActive('taskList'),
          textAlign: currentEditor.getAttributes(currentEditor.isActive('heading') ? 'heading' : 'paragraph').textAlign ?? 'left',
          underline: currentEditor.isActive('underline'),
          fontSize: currentEditor.getAttributes('textStyle').fontSize ?? '',
        }
      : null,
  })

  const insertNewBlock = (type: Extract<EditorBlockType, 'code' | 'divider' | 'quote'>) => {
    if (!editor)
      return
    editor.chain().focus().insertContent(getEditorBlockInsertion(type).node).createParagraphNear().run()
  }

  const openLinkEditor = () => {
    if (!editor)
      return
    setLinkError('')
    setLinkValue(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }

  const saveLink = () => {
    if (!editor)
      return

    const normalized = normalizeLink(linkValue)
    if (linkValue.trim() && !normalized) {
      setLinkError('请输入有效的 http、https 或 mailto 地址')
      return
    }
    if (!normalized) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setLinkOpen(false)
      return
    }

    const { empty, from } = editor.state.selection
    if (empty && !editor.isActive('link')) {
      editor.chain()
        .focus()
        .insertContent(normalized)
        .setTextSelection({ from, to: from + normalized.length })
        .setLink({ href: normalized })
        .setTextSelection(from + normalized.length)
        .run()
    }
    else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    }
    setLinkOpen(false)
  }

  return (
    <div aria-label="内容格式工具栏" role="toolbar" className={styles.toolbar}>
      <label className={styles.headingSelect}>
        <span className="sr-only">段落格式</span>
        <select
          aria-label="段落格式"
          disabled={!editor}
          value={state?.heading ?? 0}
          onChange={(event) => {
            const level = Number(event.target.value)
            if (level === 0)
              editor?.chain().focus().setParagraph().run()
            else
              editor?.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 }).run()
          }}
        >
          <option value={0}>正文</option>
          <option value={1}>标题 1</option>
          <option value={2}>标题 2</option>
          <option value={3}>标题 3</option>
          <option value={4}>标题 4</option>
        </select>
      </label>

      <span aria-hidden="true" className={styles.separator} />
      <ToolButton active={state?.bold} disabled={!editor} icon={Bold} label="粗体" onPress={() => editor?.chain().focus().toggleBold().run()} />
      <ToolButton active={state?.italic} disabled={!editor} icon={Italic} label="斜体" onPress={() => editor?.chain().focus().toggleItalic().run()} />
      <ToolButton active={state?.link} disabled={!editor} icon={Link} label="链接" onPress={openLinkEditor} />
      <ToolButton active={state?.code} disabled={!editor} icon={Code} label="行内代码" onPress={() => editor?.chain().focus().toggleCode().run()} />
      <ToolButton active={state?.strike} disabled={!editor} icon={Strikethrough} label="删除线" onPress={() => editor?.chain().focus().toggleStrike().run()} />

      <span aria-hidden="true" className={styles.separator} />
      <ToolButton active={state?.bulletList} disabled={!editor} icon={ListUl} label="无序列表" onPress={() => editor?.chain().focus().toggleBulletList().run()} />
      <ToolButton active={state?.orderedList} disabled={!editor} icon={ListOl} label="有序列表" onPress={() => editor?.chain().focus().toggleOrderedList().run()} />
      <ToolButton active={state?.blockquote} disabled={!editor} icon={QuoteOpen} label="引用" onPress={() => editor?.chain().focus().toggleBlockquote().run()} />
      <ToolButton active={state?.codeBlock} disabled={!editor} icon={FileCode} label="代码块" onPress={() => editor?.chain().focus().toggleCodeBlock().run()} />

      <span aria-hidden="true" className={styles.separator} />
      <div aria-label="插入内容" className={styles.inlineToolGroup}>
        <ToolButton active={state?.taskList} disabled={!editor} icon={ListCheck} label="任务清单" onPress={() => editor?.chain().focus().toggleTaskList().run()} />
        <ToolButton active={state?.table} disabled={!editor} icon={LayoutCells} label="三列表格" onPress={() => editor?.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run()} />
        {imagePicker}
        <ToolButton disabled={!editor} icon={QuoteOpen} label="引用块" onPress={() => insertNewBlock('quote')} />
        <ToolButton disabled={!editor} icon={Minus} label="分割线" onPress={() => insertNewBlock('divider')} />
      </div>

      <span aria-hidden="true" className={styles.toolbarBreak} />
      <span aria-hidden="true" className={styles.separator} />
      <div aria-label="更多格式" className={styles.inlineToolGroup}>
        <ToolButton active={state?.underline} disabled={!editor} icon={Underline} label="下划线" onPress={() => editor?.chain().focus().toggleUnderline().run()} />
        <ToolButton active={state?.highlight} disabled={!editor} icon={Palette} label="高亮" onPress={() => editor?.chain().focus().toggleHighlight().run()} />
        <ToolButton active={state?.textAlign === 'left'} disabled={!editor} icon={TextAlignLeft} label="左对齐" onPress={() => editor?.chain().focus().setTextAlign('left').run()} />
        <ToolButton active={state?.textAlign === 'center'} disabled={!editor} icon={TextAlignCenter} label="居中" onPress={() => editor?.chain().focus().setTextAlign('center').run()} />
        <ToolButton active={state?.textAlign === 'right'} disabled={!editor} icon={TextAlignRight} label="右对齐" onPress={() => editor?.chain().focus().setTextAlign('right').run()} />
      </div>
      <label className={styles.inlineField}>
        <span>字号</span>
        <select
          aria-label="文字大小"
          disabled={!editor}
          value={state?.fontSize ?? ''}
          onChange={(event) => {
            const size = event.target.value
            if (size)
              editor?.chain().focus().setFontSize(size).run()
            else
              editor?.chain().focus().unsetFontSize().run()
          }}
        >
          <option value="">标准</option>
          <option value={TIPTAP_TEXT_SIZES.small}>小号</option>
          <option value={TIPTAP_TEXT_SIZES.large}>大号</option>
          <option value={TIPTAP_TEXT_SIZES.xlarge}>特大</option>
        </select>
      </label>
      <fieldset className={styles.inlineColorField}>
        <legend>文字颜色</legend>
        <div aria-label="文字颜色" role="group" className={styles.colorSwatches}>
          <button
            aria-label="默认文字颜色"
            aria-pressed={!state?.color}
            title="默认文字颜色"
            type="button"
            disabled={!editor}
            onClick={() => editor?.chain().focus().unsetColor().run()}
            className={styles.defaultSwatch}
          >
            <span aria-hidden="true">A</span>
          </button>
          {Object.entries(TIPTAP_TEXT_COLORS).map(([token, color]) => (
            <button
              key={token}
              aria-label={`${token}文字颜色`}
              aria-pressed={state?.color === color}
              title={`${token}文字颜色`}
              type="button"
              disabled={!editor}
              onClick={() => editor?.chain().focus().setColor(color).run()}
              className={styles.colorSwatch}
            >
              <span aria-hidden="true" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.inlineColorField}>
        <legend>背景颜色</legend>
        <div aria-label="背景颜色" role="group" className={styles.colorSwatches}>
          <button
            aria-label="默认背景颜色"
            aria-pressed={!state?.backgroundColor}
            title="默认背景颜色"
            type="button"
            disabled={!editor}
            onClick={() => editor?.chain().focus().unsetBackgroundColor().run()}
            className={styles.defaultSwatch}
          >
            <span aria-hidden="true">×</span>
          </button>
          {Object.entries(TIPTAP_BACKGROUND_COLORS).map(([token, color]) => (
            <button
              key={token}
              aria-label={`${token}背景颜色`}
              aria-pressed={state?.backgroundColor === color}
              title={`${token}背景颜色`}
              type="button"
              disabled={!editor}
              onClick={() => editor?.chain().focus().setBackgroundColor(color).run()}
              className={styles.colorSwatch}
            >
              <span aria-hidden="true" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" disabled={!editor} onClick={() => editor?.chain().focus().unsetAllMarks().run()} className={styles.clearFormat}>清除格式</button>

      <span className={styles.toolbarSpacer} />
      <ToolButton disabled={!editor || !state?.canUndo} icon={ArrowRotateLeft} label="撤销" onPress={() => editor?.chain().focus().undo().run()} />
      <ToolButton disabled={!editor || !state?.canRedo} icon={ArrowRotateRight} label="重做" onPress={() => editor?.chain().focus().redo().run()} />
      {showFocusMode ? <ToolButton disabled={false} icon={focusMode ? ChevronsCollapseUpRight : ChevronsExpandUpRight} label={focusMode ? '退出专注模式' : '专注模式'} onPress={() => onFocusModeChange(!focusMode)} /> : null}

      {linkOpen
        ? (
            <div className={styles.linkPanel}>
              <span className={styles.linkLabel}>链接地址</span>
              <div>
                <input
                  aria-label="链接地址"
                  autoFocus
                  inputMode="url"
                  placeholder="https://example.com"
                  value={linkValue}
                  onChange={(event) => {
                    setLinkError('')
                    setLinkValue(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveLink()
                    }
                    if (event.key === 'Escape')
                      setLinkOpen(false)
                  }}
                />
                <button type="button" onClick={saveLink}>应用</button>
                <button type="button" onClick={() => setLinkOpen(false)}>取消</button>
              </div>
              {linkError ? <p aria-live="polite" className={styles.linkError}>{linkError}</p> : null}
            </div>
          )
        : null}
    </div>
  )
}

function SourceToolbar({ focusMode, imagePicker, onFocusModeChange, onFormat, onInsert, showFocusMode = true }: {
  focusMode: boolean
  imagePicker: ReactNode
  onFocusModeChange: (value: boolean) => void
  onFormat: (before: string, after?: string, placeholderText?: string) => void
  onInsert: (markdown: string, selection?: { end: number, start: number }) => void
  showFocusMode?: boolean
}) {
  return (
    <div aria-label="Markdown 源码工具栏" role="toolbar" className={`${styles.toolbar} ${styles.sourceToolbar}`}>
      <label className={styles.headingSelect}>
        <span className="sr-only">段落格式</span>
        <select
          aria-label="段落格式"
          defaultValue="paragraph"
          onChange={(event) => {
            const value = event.target.value
            if (value === 'h1')
              onFormat('# ', '', '标题')
            else if (value === 'h2')
              onFormat('## ', '', '标题')
            else if (value === 'h3')
              onFormat('### ', '', '标题')
            else if (value === 'quote')
              onFormat('> ', '', '引用内容')
            event.target.value = 'paragraph'
          }}
        >
          <option value="paragraph">正文</option>
          <option value="h1">一级标题</option>
          <option value="h2">二级标题</option>
          <option value="h3">三级标题</option>
          <option value="quote">引用</option>
        </select>
      </label>

      <span aria-hidden="true" className={styles.separator} />
      <EditorToolButton icon={Bold} label="粗体" shortcut="⌘B" onPress={() => onFormat('**')} />
      <EditorToolButton icon={Italic} label="斜体" shortcut="⌘I" onPress={() => onFormat('_')} />
      <EditorToolButton icon={Strikethrough} label="删除线" onPress={() => onFormat('~~')} />
      <EditorToolButton icon={Link} label="链接" onPress={() => onFormat('[', '](https://example.com)', '链接文字')} />
      <EditorToolButton icon={Code} label="行内代码" onPress={() => onFormat('`')} />

      <span aria-hidden="true" className={styles.separator} />
      <EditorToolButton icon={ListUl} label="无序列表" onPress={() => onFormat('- ', '', '列表项')} />
      <EditorToolButton icon={ListOl} label="有序列表" onPress={() => onFormat('1. ', '', '列表项')} />
      <EditorToolButton icon={QuoteOpen} label="引用" onPress={() => onFormat('> ', '', '引用内容')} />
      <EditorToolButton icon={FileCode} label="代码块" onPress={() => onFormat('```\n', '\n```', '代码')} />

      <span aria-hidden="true" className={styles.separator} />
      <div aria-label="插入内容" className={styles.inlineToolGroup}>
        <EditorToolButton icon={ListCheck} label="任务清单" onPress={() => onInsert('- [ ] 待办事项\n- [x] 已完成事项', { end: 8, start: 6 })} />
        <EditorToolButton icon={LayoutCells} label="三列表格" onPress={() => onInsert('| 名称 | 说明 | 状态 |\n| --- | --- | --- |\n| 项目 | 内容 | 进行中 |', { end: 4, start: 2 })} />
        {imagePicker}
        <EditorToolButton icon={QuoteOpen} label="引用块" onPress={() => onFormat('> ', '', '引用内容')} />
        <EditorToolButton icon={Minus} label="分割线" onPress={() => onInsert('\n\n---\n\n')} />
      </div>

      <span className={styles.toolbarSpacer} />
      {showFocusMode ? <EditorToolButton icon={focusMode ? ChevronsCollapseUpRight : ChevronsExpandUpRight} label={focusMode ? '退出专注模式' : '专注模式'} onPress={() => onFocusModeChange(!focusMode)} /> : null}
    </div>
  )
}

function normalizeLink(value: string) {
  const trimmed = value.trim()
  if (!trimmed)
    return ''

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
      return ''
    return url.toString()
  }
  catch {
    return ''
  }
}

function getActiveHeadingIndex(editor: Editor) {
  const selectionPosition = editor.state.selection.from
  let headingIndex = 0
  let activeHeadingIndex: number | null = null
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name !== 'heading')
      return
    if (nodePosition <= selectionPosition)
      activeHeadingIndex = headingIndex
    headingIndex += 1
  })
  return activeHeadingIndex
}

function ToolButton({ active, disabled, icon: Icon, label, onPress }: {
  active?: boolean
  disabled: boolean
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element
  label: string
  onPress: () => void
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={styles.toolButton}
    >
      <Icon aria-hidden="true" height={16} width={16} />
    </button>
  )
}

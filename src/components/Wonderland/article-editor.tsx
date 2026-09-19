'use client'

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
import { toast, Toolbar } from '@heroui/react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import TiptapImage from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getEditorBlockInsertion } from '@/components/authoring/editor-blocks'
import { EditorToolButton } from '@/components/authoring/editor-controls'
import { buildEditorOutline, countEditorWords, getReadingTimeMinutes } from '@/components/authoring/editor-model'
import { EditorStudio } from '@/components/authoring/editor-studio'
import { EditorOutline, EditorWorkbenchHeader } from '@/components/authoring/editor-workbench'
import MediaPicker from '@/components/media/media-picker'
import { looksLikeMarkdown, sanitizeMarkdownForRichEditor } from '@/lib/content/markdown'
import { uploadWonderlandImage } from '@/lib/wonderland/client-upload'
import { WONDERLAND_CODE_LANGUAGES } from '@/lib/wonderland/content'
import { wonderlandLowlight } from '@/lib/wonderland/lowlight'
import {
  TIPTAP_BACKGROUND_COLORS,
  TIPTAP_TEXT_COLORS,
  TIPTAP_TEXT_SIZES,
  tiptapToWonderlandDocument,
  wonderlandToTiptapDocument,
} from '@/lib/wonderland/tiptap-document'

import type { EditorStudioProps } from '@/components/authoring/editor-studio'
import type { EditorBlockType } from '@/components/authoring/editor-workbench'
import type { MediaPickerItem } from '@/components/media/media-picker'
import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { Editor } from '@tiptap/react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

interface ArticleEditorProps {
  canUploadImages?: boolean
  compact?: boolean
  disabled?: boolean
  documentHeader?: ReactNode
  initialDocument?: WonderlandDocument
  label?: string
  maxImages?: number
  mode?: 'professional' | 'simple'
  onChange: (document: WonderlandDocument) => void
  onImageUploadBlocked?: () => void
  onSaveShortcut?: () => void
  onUploadStateChange?: (uploading: boolean) => void
  placeholder?: string
  saveState?: 'error' | 'idle' | 'saved' | 'saving'
  studio?: Omit<EditorStudioProps, 'children' | 'focusMode' | 'leftRail' | 'documentHeader' | 'documentMeta'>
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  css: 'CSS',
  html: 'HTML',
  javascript: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  markdown: 'Markdown',
  plaintext: '纯文本',
  python: 'Python',
  sql: 'SQL',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
}

const TEXT_COLOR_OPTIONS = [
  { label: '强调橙', token: 'accent', value: TIPTAP_TEXT_COLORS.accent },
  { label: '警示红', token: 'red', value: TIPTAP_TEXT_COLORS.red },
  { label: '链接蓝', token: 'blue', value: TIPTAP_TEXT_COLORS.blue },
  { label: '成功绿', token: 'green', value: TIPTAP_TEXT_COLORS.green },
  { label: '辅助灰', token: 'muted', value: TIPTAP_TEXT_COLORS.muted },
] as const

export default function ArticleEditor({
  canUploadImages = true,
  compact = false,
  disabled = false,
  documentHeader,
  initialDocument,
  label = '正文',
  maxImages = 20,
  mode = 'professional',
  onChange,
  onImageUploadBlocked,
  onSaveShortcut,
  onUploadStateChange,
  placeholder = '从这里开始撰写正文…',
  saveState = 'idle',
  studio,
}: ArticleEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  const onImageUploadBlockedRef = useRef(onImageUploadBlocked)
  const onUploadStateChangeRef = useRef(onUploadStateChange)
  const onSaveShortcutRef = useRef(onSaveShortcut)
  const [focusMode, setFocusMode] = useState(false)
  const [imageProgress, setImageProgress] = useState<number | null>(null)
  const editorMode = studio ? 'professional' : mode

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onImageUploadBlockedRef.current = onImageUploadBlocked
  }, [onImageUploadBlocked])

  useEffect(() => {
    onUploadStateChangeRef.current = onUploadStateChange
  }, [onUploadStateChange])

  useEffect(() => {
    onSaveShortcutRef.current = onSaveShortcut
  }, [onSaveShortcut])

  const uploadImages = useCallback(async (files: File[]) => {
    if (!canUploadImages) {
      toast.warning('图片需要登录后上传，文字草稿会为你保留')
      onImageUploadBlockedRef.current?.()
      return
    }
    const currentEditor = editorRef.current
    if (!currentEditor || !files.length)
      return

    const accepted = files.filter((file) => {
      if (!IMAGE_TYPES.has(file.type) || file.size > 8 * 1024 * 1024) {
        toast.danger(`${file.name || '粘贴的图片'} 不符合图片要求`)
        return false
      }
      return true
    })
    const available = Math.max(0, maxImages - countImages(currentEditor))
    const selected = accepted.slice(0, available)
    if (selected.length < accepted.length)
      toast.warning(`正文最多插入 ${maxImages} 张图片`)
    if (!selected.length)
      return

    setImageProgress(0)
    onUploadStateChangeRef.current?.(true)
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index]!
        const image = await uploadWonderlandImage(file, (partProgress) => {
          setImageProgress(Math.round((index + partProgress / 100) / selected.length * 100))
        })
        currentEditor.chain().focus().setImage({
          alt: image.name,
          src: `/api/files/${image.fileId}`,
          title: '',
        }).run()
      }
      toast.success(selected.length > 1 ? `${selected.length} 张图片已插入正文` : '图片已插入正文')
    }
    catch (error) {
      toast.danger(error instanceof Error ? error.message : '图片上传失败')
    }
    finally {
      setImageProgress(null)
      onUploadStateChangeRef.current?.(false)
      if (imageInputRef.current)
        imageInputRef.current.value = ''
    }
  }, [canUploadImages, maxImages])

  const editor = useEditor({
    content: wonderlandToTiptapDocument(initialDocument),
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': '正文编辑区',
        'data-placeholder': placeholder,
      },
      handleDrop: (_view, event) => {
        const images = Array.from(event.dataTransfer?.files ?? []).filter(file => IMAGE_TYPES.has(file.type))
        if (!images.length)
          return false
        event.preventDefault()
        void uploadImages(images)
        return true
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard)
          return false
        const images = Array.from(clipboard.files).filter(file => IMAGE_TYPES.has(file.type))
        if (images.length) {
          event.preventDefault()
          void uploadImages(images)
          return true
        }

        const explicitMarkdown = clipboard.getData('text/markdown')
        const plainText = clipboard.getData('text/plain')
        const markdown = explicitMarkdown || plainText
        if (!markdown || (!explicitMarkdown && !looksLikeMarkdown(markdown)))
          return false
        event.preventDefault()
        const sanitized = sanitizeMarkdownForRichEditor(markdown)
        editorRef.current?.commands.insertContent(sanitized.markdown, { contentType: 'markdown' })
        if (sanitized.externalImages)
          toast.warning('Markdown 已解析；外部图片已转为链接，请粘贴或上传图片以托管到本站')
        else
          toast.success('已解析粘贴的 Markdown')
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
      }),
      CodeBlockLowlight.configure({
        defaultLanguage: 'plaintext',
        enableTabIndentation: true,
        lowlight: wonderlandLowlight,
        tabSize: 2,
      }),
      TextStyleKit.configure({
        backgroundColor: {},
        fontFamily: false,
        lineHeight: false,
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: true },
      }),
      TextAlign.configure({
        alignments: ['left', 'center', 'right'],
        types: ['heading', 'paragraph'],
      }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      TiptapImage.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'wonderland-article-editor-image' },
        inline: false,
      }),
    ],
    immediatelyRender: false,
    onCreate: ({ editor: currentEditor }) => {
      editorRef.current = currentEditor
    },
    onDestroy: () => {
      editorRef.current = null
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(tiptapToWonderlandDocument(currentEditor.getJSON()))
    },
    shouldRerenderOnTransaction: false,
  })

  const stats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      characters: currentEditor?.getText().length ?? 0,
      images: currentEditor ? countImages(currentEditor) : 0,
      markdownAvailable: Boolean(currentEditor?.markdown),
      outline: currentEditor ? buildEditorOutline(currentEditor.getJSON()) : [],
      activeHeadingIndex: currentEditor ? getActiveHeadingIndex(currentEditor) : null,
      words: currentEditor ? countEditorWords(currentEditor.getText()) : 0,
    }),
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && focusMode) {
      event.preventDefault()
      setFocusMode(false)
      return
    }
    if (!disabled && onSaveShortcutRef.current && event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onSaveShortcutRef.current?.()
    }
  }

  const focusHeading = (position: number) => {
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

  const insertBlock = (type: EditorBlockType) => {
    if (disabled)
      return
    if (type === 'image') {
      if (!canUploadImages) {
        toast.warning('图片需要登录后上传，文字草稿会为你保留')
        onImageUploadBlockedRef.current?.()
        return
      }
      imageInputRef.current?.click()
      return
    }
    if (!editor)
      return
    const insertion = getEditorBlockInsertion(type)
    editor.chain().focus().insertContent(insertion.node).createParagraphNear().run()
  }

  const pickImage = () => {
    if (!canUploadImages) {
      toast.warning('图片需要登录后上传，文字草稿会为你保留')
      onImageUploadBlockedRef.current?.()
      return
    }
    imageInputRef.current?.click()
  }

  const insertLibraryImage = (item: MediaPickerItem) => {
    if (!editor || disabled)
      return
    if (countImages(editor) >= maxImages) {
      toast.warning(`正文最多插入 ${maxImages} 张图片`)
      return
    }
    editor.chain().focus().setImage({ alt: item.name, src: item.url, title: '' }).run()
    toast.success('素材已插入正文')
  }

  const outlineNode = (
    <EditorOutline activeId={stats?.activeHeadingIndex === null || stats?.activeHeadingIndex === undefined ? null : `heading-${stats.activeHeadingIndex + 1}`} items={stats?.outline ?? []} onInsertBlock={disabled ? undefined : insertBlock} onSelect={item => focusHeading(item.position)} />
  )

  const canvasNode = (
    <div className={`wonderland-editor-workbench-canvas ${studio ? 'wonderland-studio-canvas' : ''}`}>
      <EditorToolbar
        disabled={disabled || imageProgress !== null}
        editor={editor}
        focusMode={focusMode}
        imagePicker={canUploadImages
          ? (
              <MediaPicker
                title="选择正文图片"
                accept="image/jpeg,image/png,image/webp"
                kind="image"
                trigger={open => (
                  <EditorToolButton
                    disabled={disabled || imageProgress !== null}
                    icon={Picture}
                    label={imageProgress === null ? '插入图片' : `上传 ${imageProgress}%`}
                    onPress={open}
                  />
                )}
                onSelect={insertLibraryImage}
                onUpload={uploadWonderlandImage}
              />
            )
          : (
              <EditorToolButton
                disabled={disabled}
                icon={Picture}
                label="插入图片"
                onPress={pickImage}
              />
            )}
        mode={editorMode}
        showFocusMode={!studio}
        onFocusModeChange={setFocusMode}
      />
      <div className="authoring-editor-document">
        {!studio && documentHeader ? <div className="authoring-editor-document-header">{documentHeader}</div> : null}
        <EditorContent editor={editor} className="wonderland-article-editor-content" />
      </div>
    </div>
  )

  const uploadInput = (
    <input
      ref={imageInputRef}
      aria-label="上传正文图片"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      onChange={event => void uploadImages(Array.from(event.target.files ?? []))}
      className="sr-only"
    />
  )

  const footerNode = (
    <footer className="wonderland-article-editor-footer authoring-editor-footer">
      <span>
        {editorMode === 'simple'
          ? canUploadImages ? 'Markdown · 代码 · 图片' : 'Markdown · 代码 · 登录后上传图片'
          : (
              <>
                {stats?.markdownAvailable ? '支持粘贴 Markdown' : '结构化富文本'}
                {' · '}
                {canUploadImages ? '可粘贴或拖入图片' : '登录后可上传图片'}
              </>
            )}
      </span>
      <span>
        {(stats?.words ?? 0).toLocaleString('zh-CN')}
        {' '}
        词
        {' · '}
        {(stats?.characters ?? 0).toLocaleString('zh-CN')}
        {' '}
        字
        {' · '}
        {stats?.images ?? 0}
        /
        {maxImages}
        {' '}
        张图片
      </span>
    </footer>
  )

  if (studio) {
    return (
      <section aria-label="文章正文编辑器" data-studio="true" onKeyDownCapture={handleKeyDown} className={`wonderland-article-editor authoring-editor-root wonderland-studio-root ${compact ? 'is-compact' : ''}`}>
        <EditorStudio
          {...studio}
          documentHeader={documentHeader}
          documentMeta={(
            <>
              <span aria-hidden="true" className="authoring-editor-document-avatar">H</span>
              <span>Hi LLM</span>
              <span aria-hidden="true">·</span>
              <span>
                {Math.max(1, Math.ceil((stats?.words ?? 0) / 300))}
                {' '}
                分钟阅读
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {(stats?.characters ?? 0).toLocaleString('zh-CN')}
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
          <div className="wonderland-studio-editor-main">
            {canvasNode}
            {footerNode}
          </div>
        </EditorStudio>
        {uploadInput}
      </section>
    )
  }

  return (
    <section
      aria-label="文章正文编辑器"
      data-editor-mode={editorMode}
      data-focus-mode={editorMode === 'professional' && focusMode ? true : undefined}
      onKeyDownCapture={handleKeyDown}
      className={`wonderland-article-editor authoring-editor-root ${compact ? 'is-compact' : ''} ${editorMode === 'simple' ? 'is-simple' : ''}`}
    >
      {editorMode === 'professional'
        ? (
            <>
              <EditorWorkbenchHeader
                characterCount={stats?.characters ?? 0}
                label={label}
                modeLabel="结构化富文本 · 支持 Markdown 粘贴"
                readingMinutes={getReadingTimeMinutes(editor?.getText() ?? '')}
                saveState={saveState}
                wordCount={stats?.words ?? 0}
                onSaveShortcut={onSaveShortcut}
              />
              <div className="wonderland-editor-workbench-body">
                {outlineNode}
                {canvasNode}
              </div>
            </>
          )
        : <div className="wonderland-editor-simple-canvas">{canvasNode}</div>}
      {uploadInput}
      {footerNode}
    </section>
  )
}

function countImages(editor: Editor) {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image')
      count += 1
  })
  return count
}

function EditorToolbar({ disabled, editor, focusMode, imagePicker, mode, onFocusModeChange, showFocusMode = true }: {
  disabled: boolean
  editor: Editor | null
  focusMode: boolean
  imagePicker: ReactNode
  mode: 'professional' | 'simple'
  onFocusModeChange: (value: boolean) => void
  showFocusMode?: boolean
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor
      ? ({
          blockquote: currentEditor.isActive('blockquote'),
          bold: currentEditor.isActive('bold'),
          bulletList: currentEditor.isActive('bulletList'),
          code: currentEditor.isActive('code'),
          codeBlock: currentEditor.isActive('codeBlock'),
          codeLanguage: currentEditor.getAttributes('codeBlock').language ?? 'plaintext',
          color: currentEditor.getAttributes('textStyle').color ?? '',
          fontSize: currentEditor.getAttributes('textStyle').fontSize ?? '',
          heading1: currentEditor.isActive('heading', { level: 1 }),
          heading2: currentEditor.isActive('heading', { level: 2 }),
          heading3: currentEditor.isActive('heading', { level: 3 }),
          heading4: currentEditor.isActive('heading', { level: 4 }),
          highlight: currentEditor.isActive('highlight'),
          backgroundColor: currentEditor.getAttributes('textStyle').backgroundColor ?? '',
          image: currentEditor.isActive('image'),
          imageAlt: currentEditor.getAttributes('image').alt ?? '',
          imageTitle: currentEditor.getAttributes('image').title ?? '',
          italic: currentEditor.isActive('italic'),
          link: currentEditor.isActive('link'),
          orderedList: currentEditor.isActive('orderedList'),
          paragraph: currentEditor.isActive('paragraph'),
          strike: currentEditor.isActive('strike'),
          table: currentEditor.isActive('table'),
          taskList: currentEditor.isActive('taskList'),
          textAlign: currentEditor.getAttributes(currentEditor.isActive('heading') ? 'heading' : 'paragraph').textAlign ?? 'left',
          underline: currentEditor.isActive('underline'),
        })
      : null,
  })

  const insertNewBlock = (type: Extract<EditorBlockType, 'code' | 'divider' | 'quote'>) => {
    if (!editor)
      return
    editor.chain().focus().insertContent(getEditorBlockInsertion(type).node).createParagraphNear().run()
  }

  const editLink = () => {
    if (!editor)
      return
    setLinkValue(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }

  const saveLink = () => {
    if (!editor)
      return
    const value = linkValue.trim()
    if (!value) {
      editor.chain().focus().unsetLink().run()
      setLinkOpen(false)
      return
    }
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error('protocol')
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.toString() }).run()
      setLinkOpen(false)
    }
    catch {
      toast.warning('请输入完整的 http:// 或 https:// 链接')
    }
  }

  return (
    <div className="wonderland-editor-toolbar-shell">
      <Toolbar aria-label="正文编辑工具" className="wonderland-article-editor-toolbar">
        {mode === 'professional'
          ? (
              <>
                <label className="wonderland-editor-block-select">
                  <span className="sr-only">段落格式</span>
                  <select
                    aria-label="段落格式"
                    disabled={disabled}
                    value={state?.heading1 ? 'h1' : state?.heading2 ? 'h2' : state?.heading3 ? 'h3' : state?.heading4 ? 'h4' : 'paragraph'}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === 'paragraph')
                        editor?.chain().focus().setParagraph().run()
                      else
                        editor?.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run()
                    }}
                  >
                    <option value="paragraph">正文</option>
                    <option value="h1">一级标题</option>
                    <option value="h2">二级标题</option>
                    <option value="h3">三级标题</option>
                    <option value="h4">四级标题</option>
                  </select>
                </label>
                <span aria-hidden="true" className="wonderland-editor-separator" />
              </>
            )
          : null}
        <div aria-label="文字格式" className="wonderland-editor-tool-group">
          <EditorToolButton
            active={state?.bold}
            disabled={disabled}
            icon={Bold}
            label="粗体"
            shortcut="⌘B"
            onPress={() => editor?.chain().focus().toggleBold().run()}
          />
          <EditorToolButton
            active={state?.italic}
            disabled={disabled}
            icon={Italic}
            label="斜体"
            shortcut="⌘I"
            onPress={() => editor?.chain().focus().toggleItalic().run()}
          />
          <EditorToolButton
            active={state?.link}
            disabled={disabled}
            icon={Link}
            label="链接"
            shortcut="⌘K"
            onPress={editLink}
          />
          <EditorToolButton
            active={state?.code}
            disabled={disabled}
            icon={Code}
            label="行内代码"
            shortcut="⌘E"
            onPress={() => editor?.chain().focus().toggleCode().run()}
          />
        </div>

        <span aria-hidden="true" className="wonderland-editor-separator" />
        <div aria-label="列表与引用" className="wonderland-editor-tool-group">
          <EditorToolButton active={state?.bulletList} disabled={disabled} icon={ListUl} label="无序列表" onPress={() => editor?.chain().focus().toggleBulletList().run()} />
          <EditorToolButton active={state?.orderedList} disabled={disabled} icon={ListOl} label="有序列表" onPress={() => editor?.chain().focus().toggleOrderedList().run()} />
          {mode === 'professional' ? <EditorToolButton active={state?.blockquote} disabled={disabled} icon={QuoteOpen} label="引用" onPress={() => editor?.chain().focus().toggleBlockquote().run()} /> : null}
        </div>

        <span aria-hidden="true" className="wonderland-editor-separator" />
        <div aria-label="插入内容" className="wonderland-editor-tool-group wonderland-editor-insert-tools">
          {mode === 'professional' ? <EditorToolButton active={state?.taskList} disabled={disabled} icon={ListCheck} label="任务清单" onPress={() => editor?.chain().focus().toggleTaskList().run()} /> : null}
          {mode === 'professional' ? <EditorToolButton active={state?.table} disabled={disabled} icon={LayoutCells} label="三列表格" onPress={() => editor?.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run()} /> : null}
          <EditorToolButton active={state?.codeBlock} disabled={disabled} icon={FileCode} label="代码块" onPress={() => insertNewBlock('code')} />
          {imagePicker}
          {mode === 'professional' ? <EditorToolButton disabled={disabled} icon={QuoteOpen} label="引用块" onPress={() => insertNewBlock('quote')} /> : null}
          {mode === 'professional' ? <EditorToolButton disabled={disabled} icon={Minus} label="分割线" onPress={() => insertNewBlock('divider')} /> : null}
        </div>

        {mode === 'professional'
          ? (
              <>
                <span aria-hidden="true" className="wonderland-editor-toolbar-break" />
                <span aria-hidden="true" className="wonderland-editor-separator" />
                <div aria-label="更多格式" className="wonderland-editor-tool-group wonderland-editor-format-tools">
                  <EditorToolButton
                    active={state?.underline}
                    disabled={disabled}
                    icon={Underline}
                    label="下划线"
                    shortcut="⌘U"
                    onPress={() => editor?.chain().focus().toggleUnderline().run()}
                  />
                  <EditorToolButton active={state?.strike} disabled={disabled} icon={Strikethrough} label="删除线" onPress={() => editor?.chain().focus().toggleStrike().run()} />
                  <EditorToolButton active={state?.highlight} disabled={disabled} icon={Palette} label="高亮" onPress={() => editor?.chain().focus().toggleHighlight().run()} />
                  <EditorToolButton active={state?.textAlign === 'left'} disabled={disabled} icon={TextAlignLeft} label="左对齐" onPress={() => editor?.chain().focus().setTextAlign('left').run()} />
                  <EditorToolButton active={state?.textAlign === 'center'} disabled={disabled} icon={TextAlignCenter} label="居中" onPress={() => editor?.chain().focus().setTextAlign('center').run()} />
                  <EditorToolButton active={state?.textAlign === 'right'} disabled={disabled} icon={TextAlignRight} label="右对齐" onPress={() => editor?.chain().focus().setTextAlign('right').run()} />
                </div>
                <label className="wonderland-editor-inline-field">
                  <span>字号</span>
                  <select
                    aria-label="文字大小"
                    disabled={disabled}
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
                <fieldset className="wonderland-editor-inline-color-field">
                  <legend>文字颜色</legend>
                  <div aria-label="文字颜色" role="group" className="wonderland-editor-color-swatches">
                    <button
                      aria-label="默认文字颜色"
                      aria-pressed={!state?.color}
                      title="默认文字颜色"
                      type="button"
                      disabled={disabled}
                      onClick={() => editor?.chain().focus().unsetColor().run()}
                      className="is-default"
                    >
                      <span aria-hidden="true">A</span>
                    </button>
                    {TEXT_COLOR_OPTIONS.map(option => (
                      <button
                        key={option.token}
                        aria-label={option.label}
                        aria-pressed={state?.color === option.value}
                        title={option.label}
                        type="button"
                        data-color={option.token}
                        disabled={disabled}
                        onClick={() => editor?.chain().focus().setColor(option.value).run()}
                      >
                        <span aria-hidden="true" style={{ backgroundColor: option.value }} />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="wonderland-editor-inline-color-field">
                  <legend>背景颜色</legend>
                  <div aria-label="背景颜色" role="group" className="wonderland-editor-color-swatches">
                    <button
                      aria-label="默认背景颜色"
                      aria-pressed={!state?.backgroundColor}
                      title="默认背景颜色"
                      type="button"
                      disabled={disabled}
                      onClick={() => editor?.chain().focus().unsetBackgroundColor().run()}
                      className="is-default"
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
                        data-color={token}
                        disabled={disabled}
                        onClick={() => editor?.chain().focus().setBackgroundColor(color).run()}
                      >
                        <span aria-hidden="true" style={{ backgroundColor: color }} />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button type="button" disabled={disabled} onClick={() => editor?.chain().focus().unsetAllMarks().run()} className="wonderland-editor-clear-format">清除格式</button>
              </>
            )
          : null}

        <div aria-label="历史与视图" className="wonderland-editor-tool-group wonderland-editor-history-tools">
          <EditorToolButton disabled={disabled || !editor?.can().undo()} icon={ArrowRotateLeft} label="撤销" shortcut="⌘Z" onPress={() => editor?.chain().focus().undo().run()} />
          <EditorToolButton disabled={disabled || !editor?.can().redo()} icon={ArrowRotateRight} label="重做" shortcut="⇧⌘Z" onPress={() => editor?.chain().focus().redo().run()} />
          {showFocusMode && mode === 'professional' ? <EditorToolButton icon={focusMode ? ChevronsCollapseUpRight : ChevronsExpandUpRight} label={focusMode ? '退出专注模式' : '专注模式'} onPress={() => onFocusModeChange(!focusMode)} /> : null}
        </div>
      </Toolbar>

      {state?.codeBlock
        ? (
            <div className="wonderland-editor-context-bar">
              <strong>代码语言</strong>
              <select
                aria-label="代码语言"
                disabled={disabled}
                value={state.codeLanguage}
                onChange={event => editor?.chain().focus().updateAttributes('codeBlock', { language: event.target.value }).run()}
              >
                {WONDERLAND_CODE_LANGUAGES.map(language => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
              </select>
            </div>
          )
        : null}

      {mode === 'professional' && state?.table
        ? (
            <div aria-label="表格操作" className="wonderland-editor-context-bar wonderland-editor-table-tools">
              <strong>表格</strong>
              <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()}>增加列</button>
              <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}>增加行</button>
              <button type="button" onClick={() => editor?.chain().focus().mergeOrSplit().run()}>合并 / 拆分</button>
              <button type="button" onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>切换表头</button>
              <button type="button" onClick={() => editor?.chain().focus().deleteColumn().run()}>删除列</button>
              <button type="button" onClick={() => editor?.chain().focus().deleteRow().run()}>删除行</button>
              <button type="button" onClick={() => editor?.chain().focus().deleteTable().run()} className="is-danger">删除表格</button>
            </div>
          )
        : null}

      {state?.image
        ? (
            <div className="wonderland-editor-context-bar wonderland-editor-image-tools">
              <strong>图片说明</strong>
              <input aria-label="图片替代文本" placeholder="替代文本" value={state.imageAlt} onChange={event => editor?.commands.updateAttributes('image', { alt: event.target.value })} />
              <input aria-label="图片说明" placeholder="图片说明（可选）" value={state.imageTitle} onChange={event => editor?.commands.updateAttributes('image', { title: event.target.value })} />
              <button type="button" onClick={() => editor?.chain().focus().deleteSelection().run()} className="is-danger">删除图片</button>
            </div>
          )
        : null}

      {linkOpen
        ? (
            <div className="wonderland-editor-link-panel">
              <input
                aria-label="链接地址"
                autoFocus
                placeholder="https://example.com"
                value={linkValue}
                onChange={event => setLinkValue(event.target.value)}
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
          )
        : null}
    </div>
  )
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

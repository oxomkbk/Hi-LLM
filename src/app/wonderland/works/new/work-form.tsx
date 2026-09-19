'use client'

import { PaperPlane, Picture } from '@gravity-ui/icons'
import {
  Button,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AuthoringEditorSkeleton } from '@/components/authoring/editor-controls'
import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { getAuthoringCompletion } from '@/components/authoring/workspace-model'
import MediaPicker from '@/components/media/media-picker'
import { clearWonderlandDraft, loadWonderlandDraft, saveWonderlandDraft } from '@/lib/access-settings/wonderland-drafts'
import { ApiRequestError, request } from '@/lib/request'
import { uploadWonderlandWorkImage } from '@/lib/wonderland/client-upload'
import { wonderlandDocumentText } from '@/lib/wonderland/content'

import styles from '../works.module.css'

import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { WonderWorkKind } from '@/lib/wonderland/domain'
import type { FormEvent } from 'react'

const ArticleEditor = dynamic(() => import('@/components/Wonderland/article-editor'), {
  loading: () => <AuthoringEditorSkeleton minHeight="28rem" />,
  ssr: false,
})

const EMPTY_DOCUMENT: WonderlandDocument = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}

export interface WonderlandWorkDraft {
  content_json: WonderlandDocument
  cover_file_id: string
  demo_url: string | null
  id: string
  kind: WonderWorkKind
  slug: string
  source_url: string
  summary: string
  tags: string[]
  title: string
  updated_at: string
  visibility: 'deleted' | 'hidden' | 'visible'
}

export default function WonderlandWorkForm({
  initial,
  mode = 'create',
  returnHref = '/wonderland/works',
}: {
  initial?: WonderlandWorkDraft
  mode?: 'admin-create' | 'create' | 'edit'
  returnHref?: string
}) {
  const isEdit = mode === 'edit' && Boolean(initial)
  const isAdmin = mode !== 'create'
  const router = useRouter()
  const idempotencyKeyRef = useRef<string | null>(null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [kind, setKind] = useState<WonderWorkKind>(initial?.kind ?? 'app')
  const [tagsText, setTagsText] = useState(initial?.tags.join('，') ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [demoUrl, setDemoUrl] = useState(initial?.demo_url ?? '')
  const [coverFileId, setCoverFileId] = useState(initial?.cover_file_id ?? '')
  const [content, setContent] = useState<WonderlandDocument>(initial?.content_json ?? EMPTY_DOCUMENT)
  const [editorVersion, setEditorVersion] = useState(0)
  const [editorUploading, setEditorUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draftState, setDraftState] = useState<'error' | 'idle' | 'saved' | 'saving'>('idle')
  const [errors, setErrors] = useState<{ content?: string, cover?: string, tags?: string }>({})
  const contentText = useMemo(() => wonderlandDocumentText(content), [content])
  const tags = useMemo(() => parseTags(tagsText), [tagsText])
  const coverSrc = coverFileId ? `/api/files/${coverFileId}` : ''
  const busy = submitting || editorUploading
  const hasDraft = Boolean(title.trim() || summary.trim() || sourceUrl.trim() || demoUrl.trim() || tagsText.trim() || coverFileId || contentText)
  const needsNavigationGuard = hasDraft && (draftState === 'error' || draftState === 'saving')
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(title.trim()) },
    { completed: Boolean(summary.trim()) },
    { completed: contentText.length >= 30 },
    { completed: Boolean(coverFileId) },
    { completed: Boolean(sourceUrl.trim()) },
  ]), [contentText.length, coverFileId, sourceUrl, summary, title])

  /* eslint-disable react/set-state-in-effect -- autosave status reflects scheduled browser persistence */
  useEffect(() => {
    if (isAdmin)
      return
    const restored = loadWonderlandDraft('work', 'new')
    if (!restored || typeof restored.body === 'string')
      return
    const frame = window.requestAnimationFrame(() => {
      setTitle(restored.title ?? '')
      setSummary(restored.summary ?? '')
      setKind(isWorkKind(restored.workKind) ? restored.workKind : 'app')
      setTagsText((restored.tags ?? []).join('，'))
      setSourceUrl(restored.sourceUrl ?? '')
      setDemoUrl(restored.demoUrl ?? '')
      setCoverFileId(restored.coverFileId ?? '')
      setContent(restored.body as WonderlandDocument)
      setEditorVersion(value => value + 1)
      setDraftState('saved')
      toast.success('作品草稿已恢复')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin || !hasDraft || submitting)
      return
    setDraftState('saving')
    const timer = window.setTimeout(() => {
      const saved = saveWonderlandDraft({
        body: content,
        coverFileId,
        demoUrl,
        kind: 'work',
        sourceUrl,
        summary,
        tags,
        targetId: 'new',
        title,
        workKind: kind,
      })
      setDraftState(saved ? 'saved' : 'error')
    }, 650)
    return () => window.clearTimeout(timer)
  }, [content, contentText, coverFileId, demoUrl, hasDraft, isAdmin, kind, sourceUrl, submitting, summary, tags, tagsText, title])
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    if (!needsNavigationGuard)
      return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [needsNavigationGuard])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    const invalidMetadata = title.trim().length < 2 || title.trim().length > 100
      || summary.trim().length < 20 || summary.trim().length > 240
      || !/^https:\/\//i.test(sourceUrl.trim())
    if (invalidMetadata) {
      toast.warning('请完善作品名称、简介和 HTTPS 地址')
      return
    }
    if (!coverFileId)
      nextErrors.cover = '请上传一张作品封面'
    if (contentText.length < 30)
      nextErrors.content = '请至少用 30 个字符介绍作品、用法或创作过程'
    if (tags.length > 8 || tags.some(tag => tag.length > 24))
      nextErrors.tags = '最多 8 个标签，每个不超过 24 个字符'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      toast.warning('还有内容需要完善')
      const firstError = document.querySelector<HTMLElement>('[data-work-error="true"]')
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const focusTarget = firstError?.matches('input, textarea, button, select, [contenteditable="true"]')
        ? firstError
        : firstError?.querySelector<HTMLElement>('input, textarea, button, select, [contenteditable="true"]')
      focusTarget?.focus({ preventScroll: true })
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && initial) {
        await request<{ id: string, slug: string, updated_at: string }>(`/admin/wonderland/works/${initial.id}`, {
          body: JSON.stringify({
            action: 'edit',
            content,
            coverFileId,
            demoUrl: demoUrl.trim() || null,
            kind,
            sourceUrl: sourceUrl.trim(),
            summary: summary.trim(),
            tags,
            title: title.trim(),
            updatedAt: initial.updated_at,
          }),
          method: 'PATCH',
        })
        toast.success('作品已保存')
        router.push(returnHref)
        router.refresh()
        return
      }
      idempotencyKeyRef.current ??= crypto.randomUUID()
      const response = await request<{ id: string, slug: string }>(isAdmin ? '/admin/wonderland/works' : '/wonderland/works', {
        body: JSON.stringify({ content, coverFileId, demoUrl: demoUrl.trim() || null, kind, sourceUrl: sourceUrl.trim(), summary: summary.trim(), tags, title: title.trim() }),
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
        method: 'POST',
      })
      if (!isAdmin)
        clearWonderlandDraft('work', 'new')
      idempotencyKeyRef.current = null
      toast.success(isAdmin ? '作品已创建' : '作品已发布到广场')
      router.push(isAdmin ? `/admin/wonderland/works/${response.data.id}/edit` : `/wonderland/works/${response.data.slug}`)
      router.refresh()
    }
    catch (error) {
      if (!(error instanceof ApiRequestError))
        toast.danger('作品发布失败，请稍后重试')
    }
    finally {
      setSubmitting(false)
    }
  }

  const saveDraftNow = () => {
    if (isAdmin || submitting)
      return
    const saved = saveWonderlandDraft({
      body: content,
      coverFileId,
      demoUrl,
      kind: 'work',
      sourceUrl,
      summary,
      tags,
      targetId: 'new',
      title,
      workKind: kind,
    })
    setDraftState(saved ? 'saved' : 'error')
    if (saved)
      toast.success('作品草稿已保存')
    else
      toast.danger('草稿保存失败，请先复制正文')
  }

  const discardDraft = () => {
    // eslint-disable-next-line no-alert -- an explicit destructive discard needs a synchronous confirmation
    if (isAdmin || !window.confirm('清除本机草稿？此操作会丢弃当前未发布的作品。'))
      return
    clearWonderlandDraft('work', 'new')
    setTitle('')
    setSummary('')
    setKind('app')
    setTagsText('')
    setSourceUrl('')
    setDemoUrl('')
    setCoverFileId('')
    setContent(EMPTY_DOCUMENT)
    setErrors({})
    setDraftState('idle')
    setEditorVersion(value => value + 1)
  }

  const saveAdminFromShortcut = () => {
    if (!isAdmin || busy)
      return
    const form = document.getElementById('wonderland-work-editor-form')
    if (!(form instanceof HTMLFormElement))
      return
    form.requestSubmit()
  }

  const publishLabel = isAdmin ? (isEdit ? '保存作品' : '创建作品') : '发布到作品广场'
  const statusLabel = isAdmin
    ? (submitting ? '正在保存…' : isEdit ? '编辑中' : '尚未保存')
    : draftState === 'saved'
      ? '草稿已保存'
      : draftState === 'saving'
        ? '正在保存草稿…'
        : draftState === 'error'
          ? '草稿保存失败'
          : '尚未修改'

  return (
    <Form
      aria-label={isEdit ? '编辑作品' : '发布作品'}
      id="wonderland-work-editor-form"
      data-work-authoring-form
      onSubmit={onSubmit}
      className="editor-studio-business-form"
    >
      <ArticleEditor
        key={editorVersion}
        disabled={submitting}
        documentHeader={(
          <EditorStudioDocumentHeader>
            <TextField
              name="title"
              isRequired
              fullWidth
              maxLength={100}
              minLength={2}
              value={title}
              onChange={setTitle}
            >
              <Label>作品名称</Label>
              <Input variant="secondary" fullWidth placeholder="未命名作品" />
              <FieldError />
            </TextField>
            <TextField
              name="summary"
              isRequired
              fullWidth
              maxLength={240}
              minLength={20}
              value={summary}
              onChange={setSummary}
            >
              <Label>一句话介绍</Label>
              <TextArea variant="secondary" fullWidth placeholder="写一句精炼的作品摘要…" rows={2} />
              <Description>20–240 字，会显示在作品广场的卡片上。</Description>
              <FieldError />
            </TextField>
          </EditorStudioDocumentHeader>
        )}
        initialDocument={content}
        label="作品说明"
        maxImages={8}
        placeholder={'作品做了什么：\n\n如何运行或使用：\n\n技术选择与创作过程：\n\n接下来准备做什么：'}
        saveState={isAdmin ? (submitting ? 'saving' : 'idle') : draftState}
        studio={{
          actions: (
            <Button type="submit" size="sm" variant="primary" isDisabled={busy} isPending={submitting}>
              <PaperPlane />
              {publishLabel}
            </Button>
          ),
          backHref: returnHref,
          backLabel: isAdmin ? '作品管理' : '作品广场',
          brand: isAdmin ? 'Hi LLM Admin' : 'Hi LLM Editorial',
          brandHref: isAdmin ? '/admin' : '/',
          completion,
          documentLabel: title.trim() || '未命名作品',
          inspector: (
            <div>
              <EditorStudioSection title="作品属性" description="类型和标签决定作品在广场里的检索与归类。">
                <label className={styles.nativeField}>
                  <span>作品类型</span>
                  <select value={kind} onChange={event => setKind(event.target.value as WonderWorkKind)}>
                    <option value="app">应用</option>
                    <option value="game">游戏</option>
                    <option value="library">开源库</option>
                    <option value="plugin">插件</option>
                    <option value="template">模板</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <TextField
                  name="tags" fullWidth value={tagsText} onChange={(value) => {
                    setTagsText(value)
                    setErrors(current => ({ ...current, tags: undefined }))
                  }}
                >
                  <Label>标签</Label>
                  <Input variant="secondary" fullWidth placeholder="Next.js，效率工具，开源" />
                  {errors.tags ? <p className={styles.error}>{errors.tags}</p> : <Description>逗号分隔，最多 8 个。</Description>}
                </TextField>
              </EditorStudioSection>

              <EditorStudioSection title="作品封面" description="点击按钮从素材库选择；弹窗内也可以上传新图片。推荐 16:10。">
                <div
                  data-work-error={Boolean(errors.cover)}
                  className={`${styles.coverPicker} ${coverFileId ? styles.hasCover : ''}`}
                >
                  {coverSrc ? <Image alt="作品封面预览" fill sizes="320px" src={coverSrc} /> : null}
                  <span className={styles.coverPickerOverlay}>
                    <Picture />
                    <strong>{coverFileId ? '已选择封面' : '尚未选择封面'}</strong>
                    <span>PNG、JPG 或 WebP，最大 8MB</span>
                  </span>
                </div>
                <div className="mt-2">
                  <MediaPicker
                    title="选择作品封面"
                    isDisabled={busy}
                    accept="image/jpeg,image/png,image/webp"
                    buttonLabel={coverFileId ? '更换封面' : '选择封面'}
                    fullWidth
                    kind="image"
                    onSelect={(item) => {
                      setCoverFileId(item.id)
                      setErrors(current => ({ ...current, cover: undefined }))
                    }}
                    onUpload={uploadWonderlandWorkImage}
                  />
                </div>
                {errors.cover ? <p className={styles.error}>{errors.cover}</p> : null}
              </EditorStudioSection>

              <EditorStudioSection title="作品链接" defaultOpen={false} description="作品文件保留在可信外部平台，本站只负责展示。">
                <TextField
                  name="sourceUrl"
                  type="url"
                  isRequired
                  fullWidth
                  value={sourceUrl}
                  onChange={setSourceUrl}
                >
                  <Label>源代码或下载地址</Label>
                  <Input variant="secondary" fullWidth placeholder="https://github.com/your-name/project" />
                  <Description>必须是公开可访问的 HTTPS 地址。</Description>
                  <FieldError />
                </TextField>
                <TextField name="demoUrl" type="url" fullWidth value={demoUrl} onChange={setDemoUrl}>
                  <Label>在线演示地址（可选）</Label>
                  <Input variant="secondary" fullWidth placeholder="https://your-project.example" />
                  <FieldError />
                </TextField>
              </EditorStudioSection>

              <EditorStudioSection title="发布检查" defaultOpen={false}>
                {errors.content ? <p data-work-error="true" className={styles.error}>{errors.content}</p> : null}
                <p className="text-xs leading-5 text-muted">发布前请确认正文、封面与链接均可公开访问，并移除密钥、令牌和个人隐私。</p>
              </EditorStudioSection>
            </div>
          ),
          inspectorFooter: (
            <>
              {!isAdmin
                ? <Button type="button" variant="secondary" isDisabled={busy} onPress={saveDraftNow}>保存草稿</Button>
                : null}
              <Button type="submit" variant="primary" isDisabled={busy} isPending={submitting}>
                <PaperPlane />
                {publishLabel}
              </Button>
            </>
          ),
          discardAction: !isAdmin
            ? <Button type="button" variant="ghost" isDisabled={busy} onPress={discardDraft}>清除本机草稿</Button>
            : null,
          inspectorTitle: '作品发布设置',
          statusLabel,
          statusTone: draftState === 'error' ? 'danger' : submitting || draftState === 'saving' ? 'saving' : draftState === 'saved' ? 'success' : 'neutral',
        }}
        onChange={(document) => {
          setContent(document)
          setErrors(current => ({ ...current, content: undefined }))
        }}
        onSaveShortcut={isAdmin ? saveAdminFromShortcut : saveDraftNow}
        onUploadStateChange={setEditorUploading}
      />
    </Form>
  )
}

function isWorkKind(value?: string): value is WonderWorkKind {
  return value === 'app' || value === 'game' || value === 'library' || value === 'plugin' || value === 'template' || value === 'other'
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))]
}

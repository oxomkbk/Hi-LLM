'use client'

import { PaperPlane } from '@gravity-ui/icons'
import {
  Button,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AuthoringEditorSkeleton } from '@/components/authoring/editor-controls'
import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { clearWonderlandDraft, loadWonderlandDraft, saveWonderlandDraft } from '@/lib/access-settings/wonderland-drafts'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { ApiRequestError, request } from '@/lib/request'
import { wonderlandDocumentText } from '@/lib/wonderland/content'

import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { WonderCategory } from '@/lib/wonderland/domain'
import type { FormEvent } from 'react'

const ArticleEditor = dynamic(() => import('@/components/Wonderland/article-editor'), {
  loading: () => <AuthoringEditorSkeleton minHeight="24rem" />,
  ssr: false,
})

const EMPTY_DOCUMENT: WonderlandDocument = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}
const HISTORY_DRAFT_GUARD_KEY = '__hillmNavWonderlandDraftGuard'

export default function WonderlandQuestionForm({ authenticated, categories }: { authenticated: boolean, categories: WonderCategory[] }) {
  const router = useRouter()
  const [content, setContent] = useState<WonderlandDocument>(EMPTY_DOCUMENT)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [editorVersion, setEditorVersion] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ categoryId?: string, content?: string }>({})
  const [draftStatus, setDraftStatus] = useState<'error' | 'idle' | 'saved' | 'saving'>('idle')
  const draftStatusRef = useRef(draftStatus)
  const historyGuardCleanupTimerRef = useRef<number | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const selectableCategories = useMemo(() => categories.filter(item => item.scope === 'question' && item.is_active), [categories])
  const contentText = useMemo(() => wonderlandDocumentText(content), [content])
  const hasEditorContent = useMemo(() => documentHasDraftContent(content), [content])
  const hasDraft = Boolean(title.trim() || summary.trim() || categoryId || hasEditorContent)
  const needsNavigationGuard = hasDraft && (draftStatus === 'error' || draftStatus === 'saving')
  draftStatusRef.current = draftStatus

  const markDraftChange = (hasNextDraft: boolean) => {
    if (submitting)
      return
    if (hasNextDraft) {
      setDraftStatus('saving')
      return
    }
    setDraftStatus(clearWonderlandDraft('question', 'new') ? 'idle' : 'error')
  }

  useEffect(() => {
    const restored = loadWonderlandDraft('question', 'new')
    if (!restored || typeof restored.body === 'string')
      return
    const frame = window.requestAnimationFrame(() => {
      setTitle(restored.title ?? '')
      setSummary(restored.summary ?? '')
      setCategoryId(restored.categoryId ?? '')
      setContent(restored.body as WonderlandDocument)
      setEditorVersion(value => value + 1)
      setDraftStatus('saved')
      toast.success('问题草稿已恢复，请确认后发布')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!hasDraft || submitting)
      return
    const timer = window.setTimeout(() => {
      const saved = saveWonderlandDraft({
        body: content,
        categoryId,
        kind: 'question',
        summary,
        tags: [],
        targetId: 'new',
        title,
      })
      setDraftStatus(saved ? 'saved' : 'error')
    }, 650)
    return () => window.clearTimeout(timer)
  }, [categoryId, content, hasDraft, submitting, summary, title])

  useEffect(() => {
    if (!needsNavigationGuard)
      return
    if (historyGuardCleanupTimerRef.current !== null) {
      window.clearTimeout(historyGuardCleanupTimerRef.current)
      historyGuardCleanupTimerRef.current = null
    }
    const guardedUrl = window.location.href
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state as Record<string, unknown> : {}
    const existingGuardId = typeof currentState[HISTORY_DRAFT_GUARD_KEY] === 'string' ? currentState[HISTORY_DRAFT_GUARD_KEY] : ''
    const guardId = existingGuardId || crypto.randomUUID()
    if (!existingGuardId)
      window.history.pushState({ ...currentState, [HISTORY_DRAFT_GUARD_KEY]: guardId }, '', guardedUrl)
    let guardActive = true
    let permitNextPopState = false
    const confirmPendingDraftLeave = () => {
      // eslint-disable-next-line no-alert -- only pending or failed local writes require a synchronous choice before navigation
      return window.confirm(draftStatusRef.current === 'error' ? '本地草稿尚未保存。确定离开并放弃当前修改吗？' : '草稿正在保存。确定现在离开吗？')
    }
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const protectNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey)
        return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || anchor.target === '_blank')
        return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.href === window.location.href)
        return
      if (!confirmPendingDraftLeave()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const protectHistoryNavigation = (event: PopStateEvent) => {
      if (permitNextPopState) {
        permitNextPopState = false
        return
      }
      event.stopImmediatePropagation()
      if (confirmPendingDraftLeave()) {
        guardActive = false
        permitNextPopState = true
        window.history.back()
        return
      }
      window.history.pushState({ ...currentState, [HISTORY_DRAFT_GUARD_KEY]: guardId }, '', guardedUrl)
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    window.addEventListener('popstate', protectHistoryNavigation, true)
    document.addEventListener('click', protectNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeave)
      window.removeEventListener('popstate', protectHistoryNavigation, true)
      document.removeEventListener('click', protectNavigation, true)
      if (guardActive) {
        historyGuardCleanupTimerRef.current = window.setTimeout(() => {
          historyGuardCleanupTimerRef.current = null
          if (window.location.href === guardedUrl && window.history.state?.[HISTORY_DRAFT_GUARD_KEY] === guardId)
            window.history.back()
        }, 0)
      }
    }
  }, [needsNavigationGuard])

  const preserveAndLogin = () => {
    const saved = saveWonderlandDraft({
      body: content,
      categoryId,
      kind: 'question',
      summary,
      tags: [],
      targetId: 'new',
      title,
    })
    if (!saved) {
      setDraftStatus('error')
      toast.danger('无法保存本地草稿，请先复制内容再登录')
      return
    }
    window.location.assign(createLoginUrl('/wonderland/ask'))
  }

  const saveDraftNow = () => {
    if (submitting)
      return
    const saved = saveWonderlandDraft({
      body: content,
      categoryId,
      kind: 'question',
      summary,
      tags: [],
      targetId: 'new',
      title,
    })
    setDraftStatus(saved ? 'saved' : 'error')
    if (saved)
      toast.success('问题草稿已保存')
    else
      toast.danger('草稿保存失败，请先复制正文')
  }

  const discardDraft = () => {
    // eslint-disable-next-line no-alert -- an explicit destructive discard needs a synchronous confirmation
    if (!window.confirm('清除本机草稿？此操作会丢弃当前未发布的问题。'))
      return
    clearWonderlandDraft('question', 'new')
    setTitle('')
    setSummary('')
    setCategoryId('')
    setContent(EMPTY_DOCUMENT)
    setEditorVersion(value => value + 1)
    setFieldErrors({})
    setDraftStatus('idle')
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const normalizedTitle = String(form.get('title') ?? '').trim()
    const normalizedSummary = String(form.get('summary') ?? '').trim()
    const nextErrors: { categoryId?: string, content?: string } = {}
    if (!categoryId)
      nextErrors.categoryId = '请选择问题分类'
    if (contentText.length < 30)
      nextErrors.content = '请至少填写 30 个字符，说明问题现象、复现步骤或已经尝试的方法'
    setFieldErrors(nextErrors)
    const firstError = Object.keys(nextErrors)[0] as keyof typeof nextErrors | undefined
    if (firstError) {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(firstError === 'categoryId' ? 'wonderland-question-category' : 'wonderland-question-content')
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target?.focus({ preventScroll: true })
      })
      toast.warning('还有内容需要完善，已为你定位')
      return
    }
    if (!authenticated) {
      preserveAndLogin()
      return
    }

    setSubmitting(true)
    try {
      idempotencyKeyRef.current ??= crypto.randomUUID()
      const result = await request<{ id: string, slug: string }>('/wonderland/questions', {
        body: JSON.stringify({ categoryId, content, summary: normalizedSummary, tagIds: [], title: normalizedTitle }),
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
        method: 'POST',
      })
      toast.success('问题已发布')
      clearWonderlandDraft('question', 'new')
      idempotencyKeyRef.current = null
      router.push(`/wonderland/questions/${result.data.slug}`)
      router.refresh()
    }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED')
        preserveAndLogin()
    }
    finally {
      setSubmitting(false)
    }
  }

  const completion = [title.trim(), summary.trim(), categoryId, contentText.trim()].filter(Boolean).length
  const publishLabel = uploading ? '正在上传图片' : submitting ? '正在发布' : '发布问题'

  return (
    <Form aria-label="发布问题" onSubmit={onSubmit} className="editor-studio-business-form">
      <ArticleEditor
        key={editorVersion}
        canUploadImages={authenticated}
        disabled={submitting}
        documentHeader={(
          <EditorStudioDocumentHeader>
            <TextField
              name="title" isRequired fullWidth maxLength={160} minLength={8}
              value={title} onChange={(value) => {
                setTitle(value)
                markDraftChange(Boolean(value.trim() || summary.trim() || categoryId || hasEditorContent))
              }}
            >
              <Label>问题标题</Label>
              <Input variant="secondary" fullWidth placeholder="无标题问题" />
              <Description>标题脱离正文后也应说明具体问题。</Description>
              <FieldError />
            </TextField>
            <TextField
              name="summary" isRequired fullWidth maxLength={300} minLength={20}
              value={summary} onChange={(value) => {
                setSummary(value)
                markDraftChange(Boolean(title.trim() || value.trim() || categoryId || hasEditorContent))
              }}
            >
              <Label>问题摘要</Label>
              <TextArea variant="secondary" fullWidth placeholder="写一句精炼的摘要…" rows={2} />
              <Description>20–300 字。</Description>
              <FieldError />
            </TextField>
          </EditorStudioDocumentHeader>
        )}
        initialDocument={content}
        label="问题详情"
        maxImages={8}
        placeholder={'使用环境：\n\n问题现象与复现步骤：\n\n已经尝试的方法：\n\n期望结果：'}
        saveState={draftStatus}
        studio={{
          actions: (
            <Button type="submit" size="sm" variant="primary" isDisabled={submitting || uploading} isPending={submitting || uploading}>
              {submitting ? <Spinner color="current" size="sm" /> : <PaperPlane />}
              {publishLabel}
            </Button>
          ),
          backHref: '/wonderland',
          backLabel: '妙妙屋',
          brand: 'Hi LLM Editorial',
          completion: { completed: completion, total: 4 },
          documentLabel: title.trim() || '未命名问题',
          inspector: (
            <div>
              <EditorStudioSection title="问题分类" description="选择最具体的分类，让合适的人更快看到。">
                <label data-invalid={Boolean(fieldErrors.categoryId) || undefined} className="wonderland-native-field">
                  <span>分类</span>
                  <select
                    aria-describedby={fieldErrors.categoryId ? 'wonderland-question-category-error' : undefined} aria-invalid={Boolean(fieldErrors.categoryId)} id="wonderland-question-category" name="categoryId" required
                    value={categoryId} onChange={(event) => {
                      const value = event.target.value
                      setCategoryId(value)
                      markDraftChange(Boolean(title.trim() || summary.trim() || value || hasEditorContent))
                      setFieldErrors(current => ({ ...current, categoryId: undefined }))
                    }}
                  >
                    <option disabled value="">请选择分类</option>
                    {selectableCategories.map(category => <option key={category.id} value={category.id}>{category.depth === 1 ? `└ ${category.name}` : category.name}</option>)}
                  </select>
                  {fieldErrors.categoryId ? <small id="wonderland-question-category-error" role="alert" className="wonderland-field-error">{fieldErrors.categoryId}</small> : <small>选择最具体的分类。</small>}
                </label>
              </EditorStudioSection>
              <EditorStudioSection title="发布检查" defaultOpen={false}>
                {fieldErrors.content ? <p id="wonderland-question-content-error" role="alert" className="wonderland-field-error">{fieldErrors.content}</p> : null}
                <p className="text-xs leading-5 text-muted">请补充复现步骤、已尝试的方法和期望结果，并移除密钥、令牌或个人隐私。</p>
                <p className="text-xs leading-5 text-muted">{authenticated ? '发布后进入妙妙屋问题列表。' : '发布时需要登录，当前草稿会保留在浏览器。'}</p>
              </EditorStudioSection>
            </div>
          ),
          inspectorFooter: (
            <Button type="submit" variant="primary" isDisabled={submitting || uploading} isPending={submitting || uploading}>
              {submitting ? <Spinner color="current" size="sm" /> : <PaperPlane />}
              {publishLabel}
            </Button>
          ),
          discardAction: <Button type="button" variant="ghost" isDisabled={submitting || uploading} onPress={discardDraft}>清除本机草稿</Button>,
          inspectorTitle: '问题发布设置',
        }}
        onChange={(document) => {
          setContent(document)
          markDraftChange(Boolean(title.trim() || summary.trim() || categoryId || documentHasDraftContent(document)))
          setFieldErrors(current => ({ ...current, content: undefined }))
        }}
        onImageUploadBlocked={preserveAndLogin}
        onSaveShortcut={saveDraftNow}
        onUploadStateChange={setUploading}
      />
    </Form>
  )
}

function documentHasDraftContent(document: WonderlandDocument) {
  return Boolean(wonderlandDocumentText(document) || document.content.some(block => block.type === 'image'))
}

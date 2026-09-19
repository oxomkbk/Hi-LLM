'use client'

import { CommentPlus, Paperclip, PaperPlane, Xmark } from '@gravity-ui/icons'
import { Button, Spinner, toast } from '@heroui/react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import { useAuthUser } from '@/hooks/use-auth-user'
import { clearWonderlandDraft, loadWonderlandDraft, saveWonderlandDraft } from '@/lib/access-settings/wonderland-drafts'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { inspectMarkdownImages, markdownPlainText, sanitizeMarkdownForRichEditor } from '@/lib/content/markdown'
import { ApiRequestError, request } from '@/lib/request'
import { uploadWonderlandImage } from '@/lib/wonderland/client-upload'

import type { ClipboardEvent, DragEvent, FormEvent } from 'react'

export type CommentTarget
  = | { answerId: string, questionId: string, type: 'answer' }
    | { newsId: string, type: 'news' }
    | { questionId: string, type: 'question' }

interface CommentComposerProps {
  label?: string
  parentId?: string
  target: CommentTarget
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default function CommentComposer({ label = '添加评论', parentId, target }: CommentComposerProps) {
  const { loading: authLoading, user } = useAuthUser()
  const { loading: accessLoading, settings } = useAccessSettings()
  const pathname = usePathname()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState('')
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const fileIds = useMemo(() => inspectMarkdownImages(body).fileIds, [body])
  const draftTargetId = commentDraftTarget(target)

  useEffect(() => {
    const restored = loadWonderlandDraft('comment', draftTargetId, parentId)
    if (!restored || typeof restored.body !== 'string' || !restored.body)
      return
    const frame = window.requestAnimationFrame(() => {
      setBody(restored.body as string)
      setOpen(true)
      toast.success('评论草稿已恢复')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [draftTargetId, parentId])

  const preserveAndLogin = () => {
    saveWonderlandDraft({
      body,
      kind: 'comment',
      parentId: parentId ?? null,
      targetId: draftTargetId,
    })
    window.location.assign(createLoginUrl(pathname))
  }

  const discard = () => {
    setBody('')
    setOpen(false)
    clearWonderlandDraft('comment', draftTargetId, parentId)
  }

  if (authLoading || accessLoading)
    return null
  if (!settings.wonderlandSubmissionEnabled)
    return null
  if (!user && settings.wonderlandComposerMode === 'authenticated') {
    return (
      <Link href={createLoginUrl(pathname)} className={`wonderland-comment-login ${parentId ? 'is-reply' : 'is-root'}`}>
        <CommentPlus />
        <span>{parentId ? '登录后回复' : '登录后参与讨论'}</span>
        {!parentId ? <strong>登录</strong> : null}
      </Link>
    )
  }
  if (user && user.role !== 'admin' && !user.canComment) {
    return (
      <Link href="/account" className={`wonderland-comment-login ${parentId ? 'is-reply' : 'is-root'}`}>
        <CommentPlus />
        <span>评论权限已关闭</span>
        {!parentId ? <strong>查看账户</strong> : null}
      </Link>
    )
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`wonderland-comment-trigger ${parentId ? 'is-reply' : 'is-root'}`}>
        {parentId
          ? <CommentPlus />
          : <span aria-hidden="true" className="wonderland-comment-trigger-avatar">{(user?.name || user?.email || '我').slice(0, 1).toUpperCase()}</span>}
        <span>{parentId ? label : '写下评论，补充细节或提出澄清…'}</span>
        {!parentId ? <strong>{label}</strong> : null}
      </button>
    )
  }

  const uploadImages = async (files: File[]) => {
    if (!user) {
      toast.warning('图片需要登录后上传，文字草稿会为你保留')
      preserveAndLogin()
      return
    }
    const accepted = files.filter(file => IMAGE_TYPES.has(file.type) && file.size > 0 && file.size <= 8 * 1024 * 1024)
    if (accepted.length !== files.length)
      toast.warning('只支持 8MB 以内的 PNG、JPG 和 WebP 图片')
    const available = Math.max(0, 4 - fileIds.length)
    const selected = accepted.slice(0, available)
    if (selected.length < accepted.length)
      toast.warning('每条评论最多插入 4 张图片')
    if (!selected.length)
      return

    setUploadProgress(0)
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index]!
        const uploaded = await uploadWonderlandImage(file, (part) => {
          setUploadProgress(Math.round((index + part / 100) / selected.length * 100))
        })
        const alt = uploaded.name
          .replaceAll('[', ' ')
          .replaceAll(']', ' ')
          .replace(/[\r\n]/g, ' ')
          .trim() || '评论图片'
        setBody(current => `${current.trimEnd()}${current.trim() ? '\n\n' : ''}![${alt}](/api/files/${uploaded.fileId})`)
      }
      toast.success(selected.length > 1 ? `${selected.length} 张图片已加入评论` : '图片已加入评论')
    }
    catch (error) {
      toast.danger(error instanceof Error ? error.message : '图片上传失败')
    }
    finally {
      setUploadProgress(null)
      if (inputRef.current)
        inputRef.current.value = ''
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (!images.length)
      return
    event.preventDefault()
    void uploadImages(images)
  }

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    const images = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    if (!images.length)
      return
    event.preventDefault()
    void uploadImages(images)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const sanitized = sanitizeMarkdownForRichEditor(body)
    const images = inspectMarkdownImages(sanitized.markdown)
    if (markdownPlainText(sanitized.markdown).length < 2 && !images.fileIds.length) {
      toast.warning('请填写评论内容或添加图片')
      return
    }
    if (sanitized.externalImages)
      toast.warning('外部图片已转为普通链接；需要展示图片请粘贴或上传')
    if (!user) {
      preserveAndLogin()
      return
    }

    setSubmitting(true)
    try {
      await request(commentEndpoint(target), {
        body: JSON.stringify({
          body: sanitized.markdown,
          parentId: parentId ?? null,
          ...(target.type === 'answer' ? { questionId: target.questionId } : {}),
        }),
        method: 'POST',
      })
      setBody('')
      setOpen(false)
      clearWonderlandDraft('comment', draftTargetId, parentId)
      toast.success(parentId ? '回复已发布' : '评论已发布')
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

  return (
    <form
      onDragOver={event => event.preventDefault()}
      onDrop={handleDrop}
      onSubmit={submit}
      className={`wonderland-comment-form ${parentId ? 'is-reply' : 'is-root'}`}
    >
      <header className="wonderland-comment-form-heading">
        <span aria-hidden="true">{(user?.name || user?.email || '我').slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{parentId ? '回复讨论' : '参与讨论'}</strong>
          <small>{parentId ? '针对这条评论补充信息' : '聚焦事实、步骤和可验证的信息'}</small>
        </div>
      </header>
      <textarea
        aria-label={parentId ? '回复内容' : '评论内容'}
        autoFocus
        maxLength={2000}
        placeholder={parentId ? '回复这条评论…' : '补充细节或提出澄清；支持 Markdown，可粘贴图片…'}
        rows={parentId ? 2 : 3}
        value={body}
        onChange={event => setBody(event.target.value)}
        onPaste={handlePaste}
      />
      {fileIds.length
        ? (
            <div aria-label="评论图片" className="wonderland-comment-images">
              {fileIds.map(fileId => (
                <figure key={fileId}>
                  <Image alt="评论图片预览" height={160} src={`/api/files/${fileId}`} width={220} />
                  <button aria-label="移除图片" type="button" onClick={() => setBody(current => removeMarkdownImage(current, fileId))}>
                    <Xmark />
                  </button>
                </figure>
              ))}
            </div>
          )
        : null}
      <div className="wonderland-comment-form-actions">
        <div>
          <input
            ref={inputRef}
            aria-label="上传评论图片"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={event => void uploadImages(Array.from(event.target.files ?? []))}
            className="sr-only"
          />
          <Button type="button" size="sm" variant="ghost" isDisabled={uploadProgress !== null || fileIds.length >= 4} onPress={() => user ? inputRef.current?.click() : preserveAndLogin()}>
            {uploadProgress === null ? <Paperclip /> : <Spinner size="sm" />}
            {uploadProgress === null ? `图片 ${fileIds.length}/4` : `上传 ${uploadProgress}%`}
          </Button>
          <span>Markdown · 支持拖入和粘贴图片</span>
        </div>
        <div>
          <Button type="button" size="sm" variant="tertiary" isDisabled={submitting || uploadProgress !== null} onPress={discard}>取消</Button>
          <Button type="submit" size="sm" isDisabled={submitting || uploadProgress !== null} isPending={submitting}>
            {submitting ? <Spinner color="current" size="sm" /> : <PaperPlane />}
            {parentId ? '发布回复' : '发布评论'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function commentDraftTarget(target: CommentTarget) {
  if (target.type === 'answer')
    return `answer:${target.answerId}:question:${target.questionId}`
  if (target.type === 'news')
    return `news:${target.newsId}`
  return `question:${target.questionId}`
}

function commentEndpoint(target: CommentTarget) {
  if (target.type === 'answer')
    return `/wonderland/answers/${target.answerId}/comments`
  if (target.type === 'news')
    return `/wonderland/news/${target.newsId}/comments`
  return `/wonderland/questions/${target.questionId}/comments`
}

function removeMarkdownImage(body: string, fileId: string) {
  const escaped = fileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return body
    .replace(new RegExp(`!?\\[[^\\]]*\\]\\(\\/api\\/files\\/${escaped}\\)`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

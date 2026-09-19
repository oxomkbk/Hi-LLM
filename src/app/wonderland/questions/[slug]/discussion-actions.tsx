'use client'

import { PaperPlane } from '@gravity-ui/icons'
import { Button, Spinner, toast, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import { useAuthUser } from '@/hooks/use-auth-user'
import { clearWonderlandDraft, loadWonderlandDraft, saveWonderlandDraft } from '@/lib/access-settings/wonderland-drafts'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { ApiRequestError, request } from '@/lib/request'
import { wonderlandDocumentText } from '@/lib/wonderland/content'

import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { FormEvent } from 'react'

const ArticleEditor = dynamic(() => import('@/components/Wonderland/article-editor'), {
  loading: () => <div className="wonderland-rich-editor-loading"><Spinner /></div>,
  ssr: false,
})

const EMPTY_DOCUMENT: WonderlandDocument = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}

export function AnswerComposer({ disabled, questionId, returnPath }: { disabled: boolean, questionId: string, returnPath: string }) {
  const { loading: authLoading, user } = useAuthUser()
  const { loading: accessLoading, settings } = useAccessSettings()
  const router = useRouter()
  const [content, setContent] = useState<WonderlandDocument>(EMPTY_DOCUMENT)
  const [editorVersion, setEditorVersion] = useState(0)
  const [editorMode, setEditorMode] = useState<'professional' | 'simple'>('simple')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const selectedModeKeys = useMemo(() => new Set([editorMode]), [editorMode])

  useEffect(() => {
    const restored = loadWonderlandDraft('answer', questionId)
    if (!restored || typeof restored.body === 'string')
      return
    const frame = window.requestAnimationFrame(() => {
      setContent(restored.body as WonderlandDocument)
      setEditorVersion(value => value + 1)
      toast.success('回答草稿已恢复，请确认后发布')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [questionId])

  const preserveAndLogin = () => {
    saveWonderlandDraft({ body: content, kind: 'answer', targetId: questionId })
    window.location.assign(createLoginUrl(returnPath))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = wonderlandDocumentText(content)
    if (body.length < 2) {
      toast.warning('回答内容不能少于 2 个字符')
      return
    }
    if (!user) {
      preserveAndLogin()
      return
    }
    setSubmitting(true)
    try {
      await request(`/wonderland/questions/${questionId}/answers`, {
        body: JSON.stringify({ content }),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      })
      setContent(EMPTY_DOCUMENT)
      setEditorVersion(value => value + 1)
      clearWonderlandDraft('answer', questionId)
      toast.success('回答已发布')
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

  if (authLoading || accessLoading) {
    return (
      <div className="wonderland-composer-loading">
        <Spinner size="sm" />
        正在确认登录状态…
      </div>
    )
  }
  if (!settings.wonderlandSubmissionEnabled) {
    return (
      <div className="wonderland-login-prompt">
        <div>
          <strong>妙妙屋暂未开放发布</strong>
          <span>管理员暂时关闭了问题、回答和评论发布，你仍然可以阅读现有讨论。</span>
        </div>
      </div>
    )
  }
  if (!user && settings.wonderlandComposerMode === 'authenticated') {
    return (
      <div className="wonderland-login-prompt">
        <div>
          <strong>你有更好的解法吗？</strong>
          <span>登录后分享你的经验和证据。</span>
        </div>
        <Link href={`/login?callbackURL=${encodeURIComponent(returnPath)}`}>登录后回答</Link>
      </div>
    )
  }
  if (user && user.role !== 'admin' && !user.canAnswer) {
    return (
      <div className="wonderland-login-prompt">
        <div>
          <strong>当前账号不能发布回答</strong>
          <span>该权限由管理员配置，你仍然可以阅读和收藏现有内容。</span>
        </div>
        <Link href="/account">查看账号权限</Link>
      </div>
    )
  }
  if (disabled) {
    return (
      <div className="wonderland-login-prompt">
        <div>
          <strong>该讨论已停止接收新回答</strong>
          <span>你仍可以阅读和收藏现有内容。</span>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="wonderland-answer-composer">
      <header className="wonderland-answer-composer-header">
        <div>
          <p className="wonderland-kicker">参与讨论</p>
          <h2>写下回答</h2>
        </div>
        <ToggleButtonGroup
          aria-label="回答编辑模式"
          size="sm"
          disallowEmptySelection
          selectedKeys={selectedModeKeys}
          selectionMode="single"
          onSelectionChange={(keys) => {
            const nextMode = [...keys][0]
            if (nextMode === 'simple' || nextMode === 'professional')
              setEditorMode(nextMode)
          }}
          className="wonderland-answer-mode-switch"
        >
          <ToggleButton id="simple" variant="ghost">简洁</ToggleButton>
          <ToggleButton id="professional" variant="ghost">
            <ToggleButtonGroup.Separator />
            专业
          </ToggleButton>
        </ToggleButtonGroup>
      </header>
      <ArticleEditor
        key={editorVersion}
        canUploadImages={Boolean(user)}
        compact
        disabled={submitting}
        initialDocument={content}
        maxImages={8}
        mode={editorMode}
        placeholder={'先给出结论，再说明原因。\n\n可以粘贴 Markdown、代码或截图。'}
        onChange={setContent}
        onImageUploadBlocked={preserveAndLogin}
        onUploadStateChange={setUploading}
      />
      <div className="wonderland-answer-composer-footer">
        <small>{user ? 'Markdown · 代码 · 最多 8 张图片' : '可先写内容，发布时登录'}</small>
        <Button type="submit" variant="primary" isDisabled={submitting || uploading} isPending={submitting || uploading}>
          {submitting ? <Spinner color="current" size="sm" /> : <PaperPlane />}
          {uploading ? '正在上传图片' : submitting ? '正在发布' : '发布回答'}
        </Button>
      </div>
    </form>
  )
}

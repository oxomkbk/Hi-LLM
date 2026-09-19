'use client'

import { Alert, Button, Checkbox, Spinner, toast } from '@heroui/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AuthoringEditorSkeleton } from '@/components/authoring/editor-controls'
import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { getAuthoringCompletion } from '@/components/authoring/workspace-model'
import MediaPicker from '@/components/media/media-picker'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { uploadWonderlandImage } from '@/lib/wonderland/client-upload'
import { wonderlandDocumentText } from '@/lib/wonderland/content'

import type { WonderlandDocument } from '@/lib/wonderland/content'
import type { WonderCategory, WonderNewsStatus } from '@/lib/wonderland/domain'

const ArticleEditor = dynamic(() => import('@/components/Wonderland/article-editor'), {
  loading: () => <AuthoringEditorSkeleton minHeight="34rem" />,
  ssr: false,
})

interface AdminNewsDetail {
  category: Pick<WonderCategory, 'id' | 'name' | 'slug'>
  category_id: string
  content_json: WonderlandDocument
  cover_file_id: string | null
  created_at: string
  featured: boolean
  id: string
  pinned: boolean
  published_at: string | null
  scheduled_at: string | null
  seo_description: string | null
  seo_title: string | null
  slug: string
  sort: number
  status: WonderNewsStatus
  summary: string
  title: string
  updated_at: string
}

interface EditorData {
  article: AdminNewsDetail | null
  categories: WonderCategory[]
}

interface SaveResult {
  id: string
  slug: string
  updated_at: string
}

const EMPTY_DOCUMENT: WonderlandDocument = {
  content: [{ content: [], type: 'paragraph' }],
  schema: 'wonderland-document',
  version: 1,
}

export default function WonderlandNewsEditor({ articleId, returnHref = '/admin/wonderland/news' }: { articleId?: string, returnHref?: string }) {
  const [data, setData] = useState<EditorData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([
      request<WonderCategory[]>('/admin/wonderland/categories'),
      articleId ? request<AdminNewsDetail>('/admin/wonderland/news', { params: { id: articleId } }) : null,
    ]).then(([categories, article]) => {
      if (!active)
        return
      setLoadError(null)
      setData({
        article: article?.data ?? null,
        categories: categories.data.filter(category => category.scope === 'news'),
      })
    }).catch((error: unknown) => {
      if (!active)
        return
      setLoadError(error instanceof Error && error.message ? error.message : '编辑器数据加载失败')
    })

    return () => {
      active = false
    }
  }, [articleId, loadVersion])

  if (loadError) {
    return (
      <div className="mx-auto grid min-h-[55vh] max-w-3xl place-items-center px-4">
        <Alert status="danger" className="w-full">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>无法打开写作页面</Alert.Title>
            <Alert.Description>{loadError}</Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            onPress={() => {
              setData(null)
              setLoadError(null)
              setLoadVersion(version => version + 1)
            }}
          >
            重新加载
          </Button>
        </Alert>
      </div>
    )
  }

  if (!data)
    return <div className="grid min-h-[55vh] place-items-center"><Spinner /></div>

  return <NewsEditorForm key={data.article?.id ?? 'new'} {...data} returnHref={returnHref} />
}

function articleSnapshot(input: {
  categoryId: string
  content: WonderlandDocument
  coverFile: File | null
  coverFileId: string | null
  featured: boolean
  pinned: boolean
  scheduledAt: string
  seoDescription: string
  seoTitle: string
  sort: number
  status: WonderNewsStatus
  summary: string
  title: string
}) {
  return JSON.stringify({
    ...input,
    coverFile: input.coverFile
      ? {
          lastModified: input.coverFile.lastModified,
          name: input.coverFile.name,
          size: input.coverFile.size,
          type: input.coverFile.type,
        }
      : null,
  })
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '尚未保存'
}

function NewsEditorForm({ article, categories, returnHref }: EditorData & { returnHref: string }) {
  const router = useRouter()
  const [categoryId, setCategoryId] = useState(article?.category_id ?? categories.find(item => item.is_active)?.id ?? '')
  const [content, setContent] = useState(article?.content_json ?? EMPTY_DOCUMENT)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverFileId, setCoverFileId] = useState<string | null>(article?.cover_file_id ?? null)
  const [featured, setFeatured] = useState(article?.featured ?? false)
  const [pinned, setPinned] = useState(article?.pinned ?? false)
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocal(article?.scheduled_at))
  const [seoDescription, setSeoDescription] = useState(article?.seo_description ?? '')
  const [seoTitle, setSeoTitle] = useState(article?.seo_title ?? '')
  const [sort, setSort] = useState(article?.sort ?? 1)
  const [status, setStatus] = useState<WonderNewsStatus>(article?.status === 'archived' ? 'draft' : article?.status ?? 'draft')
  const [summary, setSummary] = useState(article?.summary ?? '')
  const [title, setTitle] = useState(article?.title ?? '')
  const [updatedAt, setUpdatedAt] = useState(article?.updated_at)
  const [uploading, setUploading] = useState(false)
  const [savingStatus, setSavingStatus] = useState<WonderNewsStatus | null>(null)
  const coverPreview = useObjectUrl(coverFile)
  const contentLength = wonderlandDocumentText(content).length
  const activeCategories = categories.filter(item => item.is_active || item.id === categoryId)
  const currentSnapshot = useMemo(() => articleSnapshot({
    categoryId,
    content,
    coverFile,
    coverFileId,
    featured,
    pinned,
    scheduledAt,
    seoDescription,
    seoTitle,
    sort,
    status,
    summary,
    title,
  }), [categoryId, content, coverFile, coverFileId, featured, pinned, scheduledAt, seoDescription, seoTitle, sort, status, summary, title])
  const savedSnapshotRef = useRef(currentSnapshot)
  const isDirty = savedSnapshotRef.current !== currentSnapshot
  const hasMeaningfulContent = Boolean(title.trim() || summary.trim() || contentLength || coverFile || coverFileId)
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(title.trim()) },
    { completed: summary.trim().length >= 20 },
    { completed: contentLength >= 30 },
    { completed: Boolean(categoryId) },
    { completed: Boolean(coverFile || coverFileId) },
  ]), [categoryId, contentLength, coverFile, coverFileId, summary, title])
  useUnsavedNavigationGuard(isDirty && hasMeaningfulContent)
  const removeCover = () => {
    setCoverFile(null)
    setCoverFileId(null)
  }
  const selectCoverFile = (file?: File | null) => {
    if (!file)
      return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.warning('封面仅支持 8MB 以内的 PNG、JPG 或 WebP')
      return
    }
    setCoverFile(file)
  }

  const save = async (nextStatus: WonderNewsStatus) => {
    const issue = validateArticle({ categoryId, contentLength, scheduledAt, status: nextStatus, summary, title })
    if (issue) {
      toast.warning(issue)
      return
    }

    setSavingStatus(nextStatus)
    try {
      let nextCoverFileId = coverFileId
      if (coverFile) {
        const uploaded = await uploadWonderlandImage(coverFile)
        nextCoverFileId = uploaded.fileId
      }
      const result = await request<SaveResult>('/admin/wonderland/news', {
        body: JSON.stringify({
          categoryId,
          content,
          coverFileId: nextCoverFileId,
          featured,
          id: article?.id,
          pinned,
          scheduledAt: nextStatus === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
          seoDescription,
          seoTitle,
          sort,
          status: nextStatus,
          summary,
          title,
          updatedAt,
        }),
        method: article ? 'PUT' : 'POST',
      })
      savedSnapshotRef.current = articleSnapshot({
        categoryId,
        content,
        coverFile: null,
        coverFileId: nextCoverFileId,
        featured,
        pinned,
        scheduledAt,
        seoDescription,
        seoTitle,
        sort,
        status: nextStatus,
        summary,
        title,
      })
      setCoverFile(null)
      setCoverFileId(nextCoverFileId)
      setStatus(nextStatus)
      setUpdatedAt(result.data.updated_at)
      toast.success(nextStatus === 'draft' ? '草稿已保存' : article ? '文章已更新' : '文章已创建')
      if (!article)
        router.replace(buildContextualHref(`/admin/wonderland/news/${result.data.id}/edit`, returnHref))
      else
        router.refresh()
    }
    catch {
      // request 会展示后端给出的具体原因。
    }
    finally {
      setSavingStatus(null)
    }
  }

  return (
    <ArticleEditor
      documentHeader={(
        <EditorStudioDocumentHeader>
          <label className="wonderland-admin-field">
            <span>文章标题</span>
            <input maxLength={160} minLength={4} placeholder="输入清晰、具体的新闻标题" value={title} onChange={event => setTitle(event.target.value)} />
            <small>
              {title.length}
              /160
            </small>
          </label>
          <label className="wonderland-admin-field">
            <span>摘要</span>
            <textarea
              maxLength={300}
              minLength={20}
              placeholder="用 20–300 个字概括文章，将显示在新闻列表中"
              rows={2}
              value={summary}
              onChange={event => setSummary(event.target.value)}
            />
            <small>
              {summary.length}
              /300
            </small>
          </label>
        </EditorStudioDocumentHeader>
      )}
      initialDocument={article?.content_json}
      label="新闻正文"
      saveState={savingStatus ? 'saving' : isDirty ? 'idle' : 'saved'}
      studio={{
        actions: (
          <>
            {article && status === 'published' ? <Link href={`/wonderland/news/${article.slug}`} target="_blank" className="wonderland-admin-preview-link">预览</Link> : null}
            <Button variant="secondary" isDisabled={Boolean(savingStatus) || uploading} isPending={savingStatus === 'draft'} onPress={() => void save('draft')}>保存草稿</Button>
            <Button isDisabled={Boolean(savingStatus) || uploading} isPending={savingStatus !== null && savingStatus !== 'draft'} onPress={() => void save(status === 'draft' ? 'published' : status)}>{primaryActionLabel(status, Boolean(article))}</Button>
          </>
        ),
        backHref: returnHref,
        backLabel: '文章管理',
        brand: 'Hi LLM Admin',
        brandHref: '/admin',
        completion: { completed: completion.completed, total: completion.total },
        documentLabel: title.trim() || (article ? '编辑文章' : '新建文章'),
        inspector: (
          <div className="wonderland-admin-article-inspector">
            <EditorStudioSection title="发布设置" description="选择立即或定时发布；下线操作只在文章列表中提供。">
              <label className="wonderland-admin-field is-compact">
                <span>发布状态</span>
                <select value={status} onChange={event => setStatus(event.target.value as WonderNewsStatus)}>
                  <option value="draft">草稿</option>
                  <option value="published">立即发布</option>
                  <option value="scheduled">定时发布</option>
                </select>
              </label>
              {status === 'scheduled'
                ? (
                    <label className="wonderland-admin-field is-compact">
                      <span>发布时间</span>
                      <input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
                    </label>
                  )
                : null}
              <label className="wonderland-admin-field is-compact">
                <span>新闻分类</span>
                <select value={categoryId} onChange={event => setCategoryId(event.target.value)}>
                  <option value="">请选择</option>
                  {activeCategories.map(category => <option key={category.id} value={category.id}>{category.depth ? `└ ${category.name}` : category.name}</option>)}
                </select>
              </label>
              <label className="wonderland-admin-field is-compact">
                <span>排序权重</span>
                <input type="number" max={99} min={1} value={sort} onChange={event => setSort(Number(event.target.value))} />
              </label>
              <div className="wonderland-admin-checks">
                <Checkbox isSelected={pinned} onChange={setPinned}>
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                  置顶文章
                </Checkbox>
                <Checkbox isSelected={featured} onChange={setFeatured}>
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                  精选推荐
                </Checkbox>
              </div>
            </EditorStudioSection>
            <EditorStudioSection title="封面图" description="点击按钮从素材库选择；弹窗内也可以上传新图片。">
              <div
                aria-label="封面图上传区，可粘贴图片"
                tabIndex={0}
                onPaste={(event) => {
                  const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
                  if (image) {
                    event.preventDefault()
                    selectCoverFile(image)
                  }
                }}
              >
                {coverPreview || coverFileId ? <div className="wonderland-admin-cover-preview" style={{ backgroundImage: `url(${coverPreview ?? `/api/files/${coverFileId}`})` }}><button type="button" onClick={removeCover}>移除封面</button></div> : <div className="wonderland-admin-cover-empty">建议 16:9，PNG、JPG 或 WebP</div>}
                <div className="mt-2">
                  <MediaPicker
                    title="选择新闻封面"
                    accept="image/jpeg,image/png,image/webp"
                    buttonLabel={coverFileId || coverFile ? '更换封面' : '选择封面'}
                    fullWidth
                    kind="image"
                    onSelect={(item) => {
                      setCoverFile(null)
                      setCoverFileId(item.id)
                    }}
                    onUpload={uploadWonderlandImage}
                  />
                </div>
              </div>
            </EditorStudioSection>
            <EditorStudioSection title="SEO 设置" defaultOpen={false} description="用于搜索结果展示，可留空由系统回退到标题与摘要。">
              <label className="wonderland-admin-field is-compact">
                <span>SEO 标题</span>
                <input maxLength={70} value={seoTitle} onChange={event => setSeoTitle(event.target.value)} />
                <small>
                  {seoTitle.length}
                  /70
                </small>
              </label>
              <label className="wonderland-admin-field is-compact">
                <span>SEO 描述</span>
                <textarea maxLength={160} rows={4} value={seoDescription} onChange={event => setSeoDescription(event.target.value)} />
                <small>
                  {seoDescription.length}
                  /160
                </small>
              </label>
            </EditorStudioSection>
            {!categories.length
              ? (
                  <p className="wonderland-admin-editor-notice">
                    尚未配置新闻分类，请先
                    <Link href="/admin/wonderland/categories">创建新闻分类</Link>
                    。
                  </p>
                )
              : null}
            <EditorStudioSection title="发布检查" defaultOpen={false} description="发布前会校验必填字段、正文长度和定时发布时间。">
              <p className="text-xs leading-5 text-muted">
                当前完成
                {completion.completed}
                /
                {completion.total}
                {' '}
                项。保存草稿不会对外发布。
              </p>
            </EditorStudioSection>
          </div>
        ),
        inspectorFooter: <Button isDisabled={Boolean(savingStatus) || uploading} isPending={savingStatus !== null && savingStatus !== 'draft'} onPress={() => void save(status === 'draft' ? 'published' : status)}>{primaryActionLabel(status, Boolean(article))}</Button>,
        inspectorTitle: '文章发布设置',
        statusLabel: isDirty ? '有未保存修改' : article ? `已保存 · ${formatDate(updatedAt)}` : '尚未保存',
        statusTone: savingStatus ? 'saving' : isDirty ? 'neutral' : 'success',
      }}
      onChange={setContent}
      onSaveShortcut={() => void save(status === 'draft' ? 'draft' : status)}
      onUploadStateChange={setUploading}
    />
  )
}

function primaryActionLabel(status: WonderNewsStatus, editing: boolean) {
  if (status === 'scheduled')
    return editing ? '更新定时' : '定时发布'
  if (status === 'published')
    return editing ? '保存更新' : '立即发布'
  return editing ? '发布更新' : '立即发布'
}

function toDateTimeLocal(value?: string | null) {
  if (!value)
    return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function useObjectUrl(file: File | null) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file])
  useEffect(() => () => {
    if (url)
      URL.revokeObjectURL(url)
  }, [url])
  return url
}

function useUnsavedNavigationGuard(enabled: boolean) {
  const bypassRef = useRef(false)

  useEffect(() => {
    if (!enabled)
      return
    let bypassTimer: number | undefined

    const bypassOnce = (duration = 1_000) => {
      bypassRef.current = true
      if (bypassTimer)
        window.clearTimeout(bypassTimer)
      bypassTimer = window.setTimeout(() => {
        bypassRef.current = false
      }, duration)
    }
    const confirmLeave = () => {
      // eslint-disable-next-line no-alert -- a synchronous choice is required before the browser discards unsaved long-form content
      return window.confirm('这篇文章还有未保存修改。确定离开当前写作页面吗？')
    }
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (bypassRef.current)
        return
      event.preventDefault()
      event.returnValue = ''
    }
    const protectLinkNavigation = (event: MouseEvent) => {
      if (bypassRef.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey)
        return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || anchor.target === '_blank')
        return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin)
        return
      if (destination.pathname === window.location.pathname && destination.search === window.location.search)
        return
      if (!confirmLeave()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      bypassOnce()
    }
    const protectBackNavigation = () => {
      if (bypassRef.current)
        return
      if (confirmLeave()) {
        bypassOnce()
        return
      }
      bypassOnce(250)
      window.history.forward()
    }

    window.addEventListener('beforeunload', warnBeforeLeave)
    window.addEventListener('popstate', protectBackNavigation)
    document.addEventListener('click', protectLinkNavigation, true)
    return () => {
      if (bypassTimer)
        window.clearTimeout(bypassTimer)
      window.removeEventListener('beforeunload', warnBeforeLeave)
      window.removeEventListener('popstate', protectBackNavigation)
      document.removeEventListener('click', protectLinkNavigation, true)
    }
  }, [enabled])
}

function validateArticle(input: {
  categoryId: string
  contentLength: number
  scheduledAt: string
  status: WonderNewsStatus
  summary: string
  title: string
}) {
  if (!input.categoryId)
    return '请选择新闻分类'
  if (input.status === 'draft')
    return null
  if (input.title.trim().length < 4)
    return '文章标题不能少于 4 个字'
  if (input.summary.trim().length < 20)
    return '文章摘要不能少于 20 个字'
  if (input.contentLength < 30)
    return '文章正文不能少于 30 个字'
  if (input.status === 'scheduled' && (!input.scheduledAt || new Date(input.scheduledAt).getTime() <= Date.now()))
    return '定时发布时间必须晚于当前时间'
  return null
}

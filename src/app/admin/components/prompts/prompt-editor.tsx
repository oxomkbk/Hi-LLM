'use client'

import {
  Copy,
  File,
  PaperPlane,
  Picture,
  TrashBin,
  Xmark,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Chip,
  Spinner,
  toast,
} from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'

import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { getAuthoringCompletion } from '@/components/authoring/workspace-model'
import MarkdownEditor from '@/components/content/markdown-editor'
import MediaPicker from '@/components/media/media-picker'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { PROMPT_GLOSSARY_LANGUAGE } from '@/lib/prompts/glossary'
import { request } from '@/lib/request'
import { uploadPromptAsset } from '@/lib/wonderland/client-upload'

import {
  buildPromptEditorDocuments,
  createPromptEditorDocuments,
} from './prompt-editor-documents'

import type { PromptEditorDocumentKey as EditorDocumentKey, PromptEditorDocuments as EditorDocuments } from './prompt-editor-documents'
import type { MediaPickerItem } from '@/components/media/media-picker'
import type {
  PromptAssetRole,
  PromptCategory,
  PromptDetail,
  PromptSaveInput,
  PromptStatus,
} from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { FormEvent } from 'react'

const DOCUMENT_TABS: Array<{ key: EditorDocumentKey, label: string }> = [
  { key: 'prompt', label: '主提示词' },
  { key: 'readme', label: '使用说明' },
  { key: 'negative', label: '负向提示词' },
  { key: 'style', label: '样式文件' },
]

const GLOSSARY_DOCUMENT_TABS: Array<{ key: EditorDocumentKey, label: string }> = [
  { key: 'prompt', label: '术语内容' },
  { key: 'glossaryPreview', label: 'HTML 预览' },
  { key: 'glossaryStyle', label: '预览样式' },
  { key: 'readme', label: '使用说明' },
]

interface Props {
  categories: PromptCategory[]
  initial: PromptDetail | null
  loadingInitial?: boolean
  onClosed?: VoidFunction
  onSaved: VoidFunction
  state: UseOverlayStateReturn
}

export default function PromptEditor({ categories, initial, loadingInitial, onClosed, onSaved, state }: Props) {
  const defaultPrimaryCategory = initial?.primary_category_id || categories[0]?.id || ''
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initial?.categories.map(category => category.id) ?? (defaultPrimaryCategory ? [defaultPrimaryCategory] : []))
  const [primaryCategory, setPrimaryCategory] = useState(defaultPrimaryCategory)
  const [documents, setDocuments] = useState<EditorDocuments>(() => createPromptEditorDocuments(initial))
  const [featured, setFeatured] = useState(initial?.featured ?? false)
  const [activeDocument, setActiveDocument] = useState<EditorDocumentKey>('prompt')
  const [assets, setAssets] = useState(initial?.assets ?? [])
  const [discardArmed, setDiscardArmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [promptId, setPromptId] = useState<string | null>(initial?.id ?? null)
  const [currentStatus, setCurrentStatus] = useState<PromptStatus>(initial?.status ?? 'draft')
  const [saving, setSaving] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const isEdit = Boolean(promptId)
  const isGlossary = initial?.documents.find(document => document.is_primary)?.language === PROMPT_GLOSSARY_LANGUAGE
  const documentTabs = isGlossary ? GLOSSARY_DOCUMENT_TABS : DOCUMENT_TABS

  const selectableCategories = useMemo(() => categories.filter(category => category.active || initial?.categories.some(current => current.id === category.id)), [categories, initial])
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(title.trim()) },
    { completed: Boolean(summary.trim()) },
    { completed: Boolean(documents.prompt.trim()) },
    { completed: Boolean(primaryCategory) },
  ]), [documents.prompt, primaryCategory, summary, title])

  useEffect(() => {
    if (!dirty)
      return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  const toggleCategory = (id: string) => {
    setDirty(true)
    setSelectedCategories((current) => {
      if (current.includes(id)) {
        if (current.length === 1)
          return current
        const next = current.filter(value => value !== id)
        if (primaryCategory === id)
          setPrimaryCategory(next[0] ?? '')
        return next
      }
      return [...current, id]
    })
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!documents.prompt.trim()) {
      setActiveDocument('prompt')
      setOperationError('请先填写主提示词')
      return
    }
    if (!primaryCategory || !selectedCategories.length) {
      toast.danger('请至少选择一个分类并设置主分类')
      return
    }
    const data = new FormData(event.currentTarget)
    const submitIntent = data.get('submitIntent')
    const requestedStatus = submitIntent === 'draft' ? 'draft' : 'published'
    const payload: PromptSaveInput = {
      assets: assets
        .filter(asset => asset.origin === 'direct_upload' || asset.origin === 'library_reference')
        .map(asset => ({
          altText: asset.alt_text,
          fileId: asset.file_id,
          isDownloadable: asset.is_downloadable,
          isEntrypoint: asset.is_entrypoint,
          isPrimary: asset.is_primary,
          name: asset.name,
          role: asset.role,
        })),
      categoryIds: selectedCategories,
      compatibility: splitValues(data.get('compatibility')),
      contentKind: String(data.get('contentKind')) as PromptSaveInput['contentKind'],
      documents: buildPromptEditorDocuments(documents, initial?.documents ?? []),
      featured,
      primaryCategoryId: primaryCategory,
      slug: String(data.get('slug') ?? '').trim(),
      sort: Number(data.get('sort') ?? 1),
      status: requestedStatus as PromptStatus,
      summary: String(data.get('summary') ?? '').trim(),
      tags: splitValues(data.get('tags')),
      title: String(data.get('title') ?? '').trim(),
    }
    setSaving(true)
    setOperationError(null)
    try {
      const result = await request<PromptDetail>(promptId ? `/admin/prompts/${promptId}` : '/admin/prompts', {
        body: JSON.stringify(payload),
        method: promptId ? 'PUT' : 'POST',
      })
      const createdNow = !promptId
      if (createdNow)
        setPromptId(result.data.id)
      setAssets(result.data.assets)
      setCurrentStatus(result.data.status)
      setDiscardArmed(false)
      setDirty(false)
      toast.success(result.msg || (createdNow ? 'Prompt 已创建' : 'Prompt 已保存'))
      onSaved()
    }
    catch (reason) {
      setOperationError(errorMessage(reason, 'Prompt 保存失败'))
    }
    finally { setSaving(false) }
  }

  const saveFromShortcut = () => {
    if (saving)
      return
    const form = document.getElementById('prompt-editor-form')
    if (!(form instanceof HTMLFormElement))
      return
    if (currentStatus !== 'published') {
      const draftButton = form.querySelector<HTMLButtonElement>('button[value="draft"]')
      form.requestSubmit(draftButton ?? undefined)
      return
    }
    form.requestSubmit()
  }

  const closeEditor = () => {
    if (saving)
      return
    if (dirty && !discardArmed) {
      setDiscardArmed(true)
      toast.warning('还有未保存的修改；再次点击关闭将放弃这些修改')
      return
    }
    state.setOpen(false)
    setDiscardArmed(false)
    onClosed?.()
  }

  const addAsset = (item: MediaPickerItem, role: PromptAssetRole) => {
    const now = new Date().toISOString()
    setAssets((current) => {
      const available = role === 'cover'
        ? current
            .filter(asset => asset.role !== 'cover' || !['direct_upload', 'library_reference'].includes(asset.origin))
            .map(asset => ({ ...asset, is_primary: false }))
        : current
      const existing = available.find(asset => asset.file_id === item.id)
      if (existing) {
        return available.map(asset => asset.file_id === item.id
          ? {
              ...asset,
              is_downloadable: role === 'attachment',
              is_entrypoint: role === 'web_preview' && !available.some(candidate => candidate.file_id !== item.id && candidate.is_entrypoint),
              is_primary: role === 'cover' || (['image', 'video', 'web_preview'].includes(role) && !available.some(candidate => candidate.file_id !== item.id && candidate.is_primary)),
              role,
            }
          : asset)
      }
      const canBePrimary = ['cover', 'image', 'video', 'web_preview'].includes(role)
      return [...available, {
        alt_text: null,
        created_at: now,
        file_id: item.id,
        id: `pending:${item.id}`,
        import_id: null,
        is_downloadable: role === 'attachment',
        is_entrypoint: role === 'web_preview' && !available.some(asset => asset.is_entrypoint),
        is_primary: role === 'cover' || (canBePrimary && !available.some(asset => asset.is_primary)),
        metadata: {},
        mime_type: item.mimeType,
        name: item.name,
        origin: 'library_reference',
        poster_asset_id: null,
        prompt_id: promptId ?? '',
        role,
        size_bytes: String(item.sizeBytes),
        sort: available.length,
        source_path: `library/${item.id}`,
        updated_at: now,
        url: item.url,
      }]
    })
    setDirty(true)
    setOperationError(null)
  }

  const assetRows = (roles: PromptAssetRole[]) => {
    const scopedAssets = assets.filter(asset => roles.includes(asset.role))
    if (!scopedAssets.length)
      return null
    return (
      <div className="prompt-admin-asset-list">
        {scopedAssets.map(asset => (
          <div key={asset.id} className="prompt-admin-asset-row">
            <span className="grid size-9 place-items-center rounded-lg bg-surface-secondary">{asset.mime_type?.startsWith('image/') ? <Picture /> : <File />}</span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{asset.name}</strong>
              <small className="text-muted">
                {promptAssetRoleLabel(asset.role)}
                {asset.is_primary ? ' · 主素材' : ''}
              </small>
            </span>
            {asset.origin === 'direct_upload' || asset.origin === 'library_reference'
              ? (
                  <Button
                    aria-label={`移除 ${asset.name}`}
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    onPress={() => {
                      setAssets(current => current.filter(item => item.id !== asset.id))
                      setDirty(true)
                    }}
                  >
                    <TrashBin />
                  </Button>
                )
              : <Chip size="sm" variant="soft">包内资源</Chip>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <form
      id="prompt-editor-form"
      onInputCapture={() => {
        setDiscardArmed(false)
        setDirty(true)
      }}
      onSubmit={onSubmit}
      className="prompt-admin-editor-form editor-studio-business-form"
    >
      <MarkdownEditor
        key={activeDocument}
        id={`prompt-admin-${activeDocument}`}
        documentHeader={(
          <EditorStudioDocumentHeader>
            <NativeField label="Prompt 标题" required className="prompt-admin-title-field">
              <input
                name="title"
                maxLength={120}
                placeholder="为内容写一个清晰、可搜索的标题"
                required
                value={title}
                onChange={event => setTitle(event.target.value)}
              />
            </NativeField>
            <NativeField label="一句话简介" required>
              <textarea
                name="summary"
                maxLength={500}
                placeholder="说明它解决什么问题、适合谁使用。"
                required
                rows={2}
                value={summary}
                onChange={event => setSummary(event.target.value)}
              />
            </NativeField>
          </EditorStudioDocumentHeader>
        )}
        label={documentTabs.find(tab => tab.key === activeDocument)?.label ?? 'Prompt 内容'}
        maxLength={2_097_152}
        minRows={18}
        placeholder={activeDocument === 'prompt' ? '输入可直接复制使用的主提示词…' : activeDocument === 'readme' ? '说明使用方式、输入参数和示例…' : activeDocument === 'negative' ? '填写需要规避的内容…' : '编辑源码内容…'}
        required={activeDocument === 'prompt'}
        saveState={saving ? 'saving' : dirty ? 'idle' : promptId ? 'saved' : 'idle'}
        sourceOnly={['style', 'glossaryPreview', 'glossaryStyle'].includes(activeDocument)}
        studio={{
          actions: (
            <>
              <Button
                aria-label="关闭编辑器"
                type="button"
                size="sm"
                variant="tertiary"
                isDisabled={saving}
                onPress={closeEditor}
              >
                <Xmark />
                关闭
              </Button>
              <Button type="submit" size="sm" variant="primary" isDisabled={loadingInitial || saving} isPending={saving}>
                {saving ? <Spinner color="current" size="sm" /> : currentStatus === 'published' ? <Copy /> : <PaperPlane />}
                {saving ? '保存中…' : currentStatus === 'published' ? '保存更新' : '发布'}
              </Button>
            </>
          ),
          backHref: '#',
          backLabel: 'Prompts',
          brand: 'Hi LLM Admin',
          brandHref: '/admin',
          completion,
          documentLabel: title.trim() || (isEdit ? '编辑 Prompt' : '新建 Prompt'),
          documentNavigation: (
            <div aria-label="选择 Prompt 文档" role="tablist" className="prompt-admin-document-tabs">
              {documentTabs.map(tab => (
                <button
                  key={tab.key}
                  aria-selected={activeDocument === tab.key}
                  role="tab"
                  type="button"
                  onClick={() => setActiveDocument(tab.key)}
                  className={activeDocument === tab.key ? 'is-active' : ''}
                >
                  {tab.label}
                  {documents[tab.key] ? <i aria-label="已有内容" /> : null}
                </button>
              ))}
            </div>
          ),
          inspector: (
            <div className="prompt-admin-studio-inspector">
              {operationError
                ? (
                    <Alert aria-live="assertive" status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>操作未完成</Alert.Title>
                        <Alert.Description>{operationError}</Alert.Description>
                      </Alert.Content>
                      <Button size="sm" variant="danger" onPress={() => setOperationError(null)}>关闭</Button>
                    </Alert>
                  )
                : null}
              <EditorStudioSection title="发布设置" description="设置内容类型和访问地址；发布状态由下方主操作自动处理。">
                <NativeField label="内容类型" required>
                  <select name="contentKind" defaultValue={initial?.content_kind ?? 'web_ui'} required>
                    {PROMPT_CONTENT_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                  </select>
                </NativeField>
                <NativeField hint="留空时系统自动生成" label="访问地址">
                  <input name="slug" defaultValue={initial?.slug ?? ''} maxLength={80} placeholder="saas-dashboard" />
                </NativeField>
              </EditorStudioSection>
              <EditorStudioSection title="分类与发现" defaultOpen={false} description="至少选择一个分类，并指定一个主分类。">
                <div className="prompt-admin-category-list">
                  {selectableCategories.map(category => (
                    <label key={category.id} className={`prompt-category-option ${selectedCategories.includes(category.id) ? 'is-selected' : ''}`}>
                      <input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={() => toggleCategory(category.id)} />
                      <span className="min-w-0 flex-1"><strong>{category.name}</strong></span>
                      {selectedCategories.includes(category.id)
                        ? <input aria-label={`设 ${category.name} 为主分类`} name="primaryCategory" type="radio" checked={primaryCategory === category.id} onChange={() => setPrimaryCategory(category.id)} />
                        : null}
                    </label>
                  ))}
                </div>
              </EditorStudioSection>
              <EditorStudioSection title="标签与适配" defaultOpen={false} description="用逗号分隔，帮助用户搜索和判断适用环境。">
                <NativeField hint="用逗号或换行分隔" label="标签">
                  <input name="tags" defaultValue={initial?.tags.join(', ') ?? ''} placeholder="dashboard, b2b" />
                </NativeField>
                <NativeField hint="框架、模型、平台或设备" label="适配项">
                  <input name="compatibility" defaultValue={initial?.compatibility.join(', ') ?? ''} placeholder="React, Claude" />
                </NativeField>
                <NativeField label="排序权重">
                  <input name="sort" type="number" defaultValue={initial?.sort ?? 1} max={99} min={1} />
                </NativeField>
                <label className="prompt-admin-check">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(event) => {
                      setFeatured(event.target.checked)
                      setDirty(true)
                    }}
                  />
                  <span>
                    <strong>精选推荐</strong>
                    <small>优先显示在 Prompts 首页</small>
                  </span>
                </label>
              </EditorStudioSection>
              <EditorStudioSection title="封面" description="用于列表卡片和详情页头图。">
                <MediaPicker
                  title="选择 Prompt 封面"
                  accept="image/jpeg,image/png,image/webp"
                  buttonLabel={assets.some(asset => asset.role === 'cover') ? '更换封面' : '选择封面'}
                  fullWidth
                  kind="image"
                  onSelect={item => addAsset(item, 'cover')}
                  onUpload={uploadPromptAsset}
                />
                {assetRows(['cover'])}
              </EditorStudioSection>
              <EditorStudioSection title="演示与预览" description="选择卡片预览图、演示视频或隔离运行的 HTML 预览。">
                <MediaPicker
                  title="选择演示与预览素材"
                  accept="image/jpeg,image/png,image/webp,video/*,.html,.htm,text/html"
                  buttonLabel="选择预览素材"
                  fullWidth
                  kind="all"
                  onSelect={item => addAsset(item, promptPreviewRole(item))}
                  onUpload={uploadPromptAsset}
                />
                {assetRows(['image', 'video', 'web_preview', 'poster'])}
              </EditorStudioSection>
              <EditorStudioSection title="附件" defaultOpen={false} description="提供给用户下载或参考的文档、数据和其他文件。">
                <MediaPicker
                  title="选择附件"
                  accept=".pdf,.md,.txt,.json,.css,.zip,application/pdf,text/plain,text/markdown,application/json,application/zip"
                  buttonLabel="选择附件"
                  fullWidth
                  kind="all"
                  onSelect={item => addAsset(item, 'attachment')}
                  onUpload={uploadPromptAsset}
                />
                {assetRows(['attachment', 'source_package'])}
              </EditorStudioSection>
            </div>
          ),
          inspectorFooter: (
            <>
              {currentStatus !== 'published'
                ? (
                    <Button
                      name="submitIntent"
                      type="submit"
                      variant="secondary"
                      isDisabled={loadingInitial || saving}
                      isPending={saving}
                      value="draft"
                    >
                      保存草稿
                    </Button>
                  )
                : null}
              <Button
                name="submitIntent"
                type="submit"
                variant="primary"
                isDisabled={loadingInitial || saving}
                isPending={saving}
                value="publish"
              >
                {currentStatus === 'published' ? '保存更新' : '发布'}
              </Button>
            </>
          ),
          discardAction: <Button type="button" variant="ghost" isDisabled={saving} onPress={closeEditor}>{discardArmed ? '确认丢弃修改' : '关闭编辑器'}</Button>,
          inspectorTitle: 'Prompt 发布设置',
          onBack: closeEditor,
          statusLabel: saving ? '正在保存…' : dirty ? '有未保存修改' : promptId ? '已保存' : '尚未创建',
          statusTone: saving ? 'saving' : dirty ? 'neutral' : promptId ? 'success' : 'neutral',
        }}
        value={documents[activeDocument]}
        onChange={(value) => {
          setDirty(true)
          setDocuments(current => ({ ...current, [activeDocument]: value }))
        }}
        onSaveShortcut={saveFromShortcut}
      />
      {loadingInitial ? <div aria-busy="true" className="prompt-admin-editor-loading"><Spinner /></div> : null}
    </form>
  )
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function NativeField({ children, className = '', hint, label, required }: { children: React.ReactNode, className?: string, hint?: string, label: string, required?: boolean }) {
  return (
    <label className={`prompt-admin-field wonderland-admin-field ${className}`}>
      <span>
        {label}
        {required ? <i> *</i> : null}
      </span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function promptAssetRoleLabel(role: PromptAssetRole) {
  return {
    attachment: '附件',
    cover: '封面',
    image: '预览图',
    poster: '视频封面',
    source_package: '资源包',
    video: '演示视频',
    web_preview: 'HTML 预览',
  }[role]
}

function promptPreviewRole(item: MediaPickerItem): PromptAssetRole {
  const extension = item.name.split('.').pop()?.toLowerCase()
  if (item.mimeType.startsWith('video/'))
    return 'video'
  if (item.mimeType === 'text/html' || extension === 'html' || extension === 'htm')
    return 'web_preview'
  return 'image'
}

function splitValues(value: FormDataEntryValue | null) {
  return [...new Set(String(value ?? '').split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]
}

'use client'

import {
  Check,
  CloudArrowUpIn,
  File,
  FolderOpen,
  Picture,
  TrashBin,
} from '@gravity-ui/icons'
import { Button, Spinner } from '@heroui/react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { getAuthoringCompletion } from '@/components/authoring/workspace-model'
import MarkdownEditor from '@/components/content/markdown-editor'
import MediaPicker from '@/components/media/media-picker'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { request } from '@/lib/request'
import { uploadCommunityPromptAsset } from '@/lib/wonderland/client-upload'

import {
  legacyPromptSubmissionDraftKey,
  promptSubmissionDraftKey,
  readPromptSubmissionDraft,
  reconcilePromptSubmissionUploadedAssets,
  writePromptSubmissionDraft,
} from './draft'
import styles from './prompt-submission-form.module.css'

import type { MediaPickerItem } from '@/components/media/media-picker'
import type {
  PromptAsset,
  PromptAssetRole,
  PromptCategory,
  PromptContentKind,
  PromptDocumentInput,
  PromptSaveInput,
} from '@/types'
import type { ChangeEvent, FormEvent } from 'react'

const TEXT_EXTENSIONS = new Set(['css', 'html', 'htm', 'json', 'less', 'md', 'markdown', 'scss', 'txt', 'yaml', 'yml'])
const MAX_ASSETS = 12

interface AssetUploadState {
  error?: string
  progress: number
  status: UploadStatus
}
type DraftStatus = 'failed' | 'idle' | 'restored' | 'saved' | 'saving'
type FieldName = 'category' | 'prompt' | 'summary' | 'title'
interface ImportedDocuments {
  prompt: string
  promptPath: string
  readme: string
  readmePath: string
  style: string
  stylePath: string
}

type LibraryAsset = MediaPickerItem & { role: PromptAssetRole }

type PromptDocumentTab = 'prompt' | 'readme'

interface SubmissionMetadata {
  compatibility: string
  summary: string
  tags: string
  title: string
}

interface SubmissionReceipt {
  failedFiles: string[]
  id: string
  scanQueued: boolean
}

type UploadStatus = 'failed' | 'queued' | 'uploaded' | 'uploading'

const EMPTY_DOCUMENTS: ImportedDocuments = {
  prompt: '',
  promptPath: 'prompts/prompt.md',
  readme: '',
  readmePath: 'README.md',
  style: '',
  stylePath: 'styles/style.css',
}

export default function PromptSubmissionForm({ categories, userId }: { categories: PromptCategory[], userId: string }) {
  const draftStorageKey = useMemo(() => promptSubmissionDraftKey(userId), [userId])
  const legacyDraftStorageKey = useMemo(() => legacyPromptSubmissionDraftKey(userId), [userId])
  const [kind, setKind] = useState<PromptContentKind>('web_ui')
  const availableCategories = useMemo(() => categories.filter(category => categoryBelongsToKind(category, categories, kind)), [categories, kind])
  const [primaryCategoryId, setPrimaryCategoryId] = useState(() => categories.find(category => category.kind === 'web_ui')?.id ?? categories[0]?.id ?? '')
  const effectivePrimaryCategoryId = availableCategories.some(category => category.id === primaryCategoryId)
    ? primaryCategoryId
    : availableCategories[0]?.id ?? ''
  const [documents, setDocuments] = useState<ImportedDocuments>(EMPTY_DOCUMENTS)
  const [metadata, setMetadata] = useState<SubmissionMetadata>({ compatibility: '', summary: '', tags: '', title: '' })
  const [assets, setAssets] = useState<File[]>([])
  const [assetKeys, setAssetKeys] = useState<Record<string, string>>({})
  const [assetStates, setAssetStates] = useState<Record<string, AssetUploadState>>({})
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, { assetId: string, isPrimary: boolean, role: string }>>({})
  const [serverAssets, setServerAssets] = useState<PromptAsset[]>([])
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([])
  const [serverAssetsVerified, setServerAssetsVerified] = useState(false)
  const [removingAssetKey, setRemovingAssetKey] = useState('')
  const [readingFiles, setReadingFiles] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [importNotice, setImportNotice] = useState('')
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null)
  const [submissionId, setSubmissionId] = useState('')
  const [submissionKey, setSubmissionKey] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle')
  const [activeDocument, setActiveDocument] = useState<PromptDocumentTab>('prompt')
  const [restoredAssetNames, setRestoredAssetNames] = useState<string[]>([])
  const [editorVersion, setEditorVersion] = useState(0)
  const folderRef = useRef<HTMLInputElement>(null)

  const visibleServerAssets = useMemo(() => serverAssets.filter(asset => !assets.some(file => uploadedAssets[fileIdentity(file)]?.assetId === asset.id)), [assets, serverAssets, uploadedAssets])
  const visibleLibraryAssets = useMemo(() => libraryAssets.filter(item => !serverAssets.some(asset => asset.file_id === item.id)), [libraryAssets, serverAssets])
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(metadata.title.trim()) },
    { completed: Boolean(metadata.summary.trim()) },
    { completed: Boolean(documents.prompt.trim()) },
    { completed: Boolean(effectivePrimaryCategoryId) },
  ]), [documents.prompt, effectivePrimaryCategoryId, metadata.summary, metadata.title])

  const formSignature = useMemo(() => JSON.stringify({ documents, kind, metadata, primaryCategoryId: effectivePrimaryCategoryId }), [documents, effectivePrimaryCategoryId, kind, metadata])
  const isDirty = formSignature !== JSON.stringify({ documents: EMPTY_DOCUMENTS, kind: 'web_ui', metadata: { compatibility: '', summary: '', tags: '', title: '' }, primaryCategoryId: categories.find(category => category.kind === 'web_ui')?.id ?? categories[0]?.id ?? '' })
    || assets.length > 0
    || libraryAssets.length > 0
    || Boolean(submissionId)

  const markEditing = useCallback(() => {
    setDraftStatus('saving')
    setError('')
  }, [])

  const addLibraryAsset = (item: MediaPickerItem, role: PromptAssetRole) => {
    setLibraryAssets((current) => {
      const available = role === 'cover' ? current.filter(asset => asset.role !== 'cover') : current
      return [...available.filter(asset => asset.id !== item.id), { ...item, role }]
    })
    markEditing()
  }

  const saveDraftNow = useCallback(() => {
    if (!draftReady || receipt)
      return
    try {
      const saved = persistDraftImmediately({
        assetKeys,
        assets,
        documents,
        kind,
        metadata,
        primaryCategoryId: effectivePrimaryCategoryId,
        submissionId,
        submissionKey: submissionKey || crypto.randomUUID(),
        storageKey: draftStorageKey,
        uploadedAssets,
      })
      setDraftStatus(saved ? 'saved' : 'failed')
    }
    catch {
      setDraftStatus('failed')
    }
  }, [assetKeys, assets, documents, draftReady, draftStorageKey, effectivePrimaryCategoryId, kind, metadata, receipt, submissionId, submissionKey, uploadedAssets])

  const clearFieldError = useCallback((field: FieldName) => {
    setFieldErrors(current => current[field] ? { ...current, [field]: undefined } : current)
  }, [])

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  /* eslint-disable react/set-state-in-effect -- browser drafts are restored after hydration */
  useEffect(() => {
    try {
      const currentDraft = window.localStorage.getItem(draftStorageKey)
      const rawDraft = currentDraft ?? window.localStorage.getItem(legacyDraftStorageKey)
      const restored = readPromptSubmissionDraft(rawDraft)
      if (restored) {
        if (!currentDraft && rawDraft) {
          window.localStorage.setItem(draftStorageKey, rawDraft)
          window.localStorage.removeItem(legacyDraftStorageKey)
        }
        setAssetKeys(restored.assetKeys)
        setDocuments(restored.documents)
        setKind(restored.kind)
        setMetadata(restored.metadata)
        setPrimaryCategoryId(restored.primaryCategoryId)
        setSubmissionId(restored.submissionId)
        setSubmissionKey(restored.submissionKey || crypto.randomUUID())
        setUploadedAssets(restored.submissionId ? restored.uploadedAssets : {})
        setServerAssetsVerified(!restored.submissionId)
        setRestoredAssetNames(restored.pendingAssetNames)
        setDraftStatus('restored')
      }
      else {
        window.localStorage.removeItem(draftStorageKey)
        setSubmissionKey(crypto.randomUUID())
        setServerAssetsVerified(true)
      }
    }
    catch {
      window.localStorage.removeItem(draftStorageKey)
      setSubmissionKey(crypto.randomUUID())
      setDraftStatus('failed')
      setServerAssetsVerified(true)
    }
    finally {
      setDraftReady(true)
    }
  }, [draftStorageKey, legacyDraftStorageKey])
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    if (!draftReady || !submissionId)
      return
    let active = true
    void request<PromptAsset[]>(`/prompt-submissions/${submissionId}/assets`).then((result) => {
      if (active) {
        setServerAssets(result.data)
        setUploadedAssets(current => reconcilePromptSubmissionUploadedAssets(current, result.data.map(asset => asset.id)))
      }
    }).catch(() => {
      if (active) {
        setServerAssets([])
        setUploadedAssets({})
        setError('文字草稿已恢复，但已上传资源暂时无法核验；重新选择文件后会安全重试，不会重复创建内容。')
      }
    }).finally(() => {
      if (active)
        setServerAssetsVerified(true)
    })
    return () => {
      active = false
    }
  }, [draftReady, submissionId])

  useEffect(() => {
    if (!draftReady || receipt || !submissionKey || !isDirty)
      return
    const timeout = window.setTimeout(() => {
      try {
        writePromptSubmissionDraft(window.localStorage, draftStorageKey, {
          assetKeys,
          documents,
          kind,
          metadata,
          pendingAssetNames: assets.filter(file => !uploadedAssets[fileIdentity(file)]).map(file => file.webkitRelativePath || file.name),
          primaryCategoryId: effectivePrimaryCategoryId,
          submissionId,
          submissionKey,
          uploadedAssets,
        })
        setDraftStatus('saved')
      }
      catch {
        setDraftStatus('failed')
      }
    }, 550)
    return () => window.clearTimeout(timeout)
  }, [assetKeys, assets, documents, draftReady, draftStorageKey, effectivePrimaryCategoryId, isDirty, kind, metadata, receipt, submissionId, submissionKey, uploadedAssets])

  useEffect(() => {
    if (!isDirty || receipt)
      return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, receipt])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftStorageKey)
      window.localStorage.removeItem(legacyDraftStorageKey)
    }
    catch {
      // A completed submission must not fail because browser storage is unavailable.
    }
  }, [draftStorageKey, legacyDraftStorageKey])

  const discardDraft = useCallback(() => {
    // eslint-disable-next-line no-alert -- an explicit destructive discard needs a synchronous confirmation
    if (!window.confirm('清除本机草稿？此操作会丢弃当前未提交的修改。'))
      return
    clearDraft()
    setDocuments(EMPTY_DOCUMENTS)
    setKind('web_ui')
    setMetadata({ compatibility: '', summary: '', tags: '', title: '' })
    setPrimaryCategoryId(categories.find(category => category.kind === 'web_ui')?.id ?? categories[0]?.id ?? '')
    setAssets([])
    setAssetKeys({})
    setAssetStates({})
    setUploadedAssets({})
    setServerAssets([])
    setLibraryAssets([])
    setSubmissionId('')
    setSubmissionKey(crypto.randomUUID())
    setRestoredAssetNames([])
    setImportNotice('')
    setError('')
    setFieldErrors({})
    setDraftStatus('idle')
    setEditorVersion(version => version + 1)
  }, [categories, clearDraft])

  useEffect(() => {
    if (!isDirty || receipt)
      return
    const protectNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!target || target.getAttribute('target') === '_blank' || target.getAttribute('href')?.startsWith('#'))
        return
      // eslint-disable-next-line no-alert -- blocking in-app navigation prevents accidental loss while the server draft is incomplete
      if (!window.confirm('文字草稿已经自动保存。确定离开当前投稿页面吗？')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', protectNavigation, true)
    return () => document.removeEventListener('click', protectNavigation, true)
  }, [isDirty, receipt])

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length)
      return
    if (!serverAssetsVerified) {
      setError('正在恢复已上传资源，请稍候再选择文件。')
      return
    }
    setReadingFiles(true)
    setError('')
    setImportNotice('')
    markEditing()
    try {
      const nextDocuments = { ...documents }
      const nextAssets: File[] = []
      let invalidFileCount = 0
      for (const file of selected) {
        const sourcePath = file.webkitRelativePath || file.name
        const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (TEXT_EXTENSIONS.has(extension) && file.size <= 2 * 1024 * 1024) {
          const content = await file.text()
          if (assignImportedDocument(nextDocuments, file.name, sourcePath, content))
            continue
        }
        if (file.size <= 0 || file.size > 200 * 1024 * 1024) {
          invalidFileCount += 1
          continue
        }
        nextAssets.push(file)
      }
      setDocuments(nextDocuments)
      const mergedAssets = mergeFiles(assets, nextAssets)
      const localAssetLimit = Math.max(0, MAX_ASSETS - visibleServerAssets.length - visibleLibraryAssets.length)
      const overflowCount = Math.max(0, mergedAssets.length - localAssetLimit)
      const merged = mergedAssets.slice(0, localAssetLimit)
      setAssets(merged)
      setAssetKeys((current) => {
        const next = { ...current }
        merged.forEach((file) => {
          const key = fileIdentity(file)
          next[key] ??= crypto.randomUUID()
        })
        return next
      })
      setAssetStates(current => Object.fromEntries(merged.map((file) => {
        const key = fileIdentity(file)
        return [key, uploadedAssets[key]
          ? { progress: 100, status: 'uploaded' as const }
          : current[key] ?? { progress: 0, status: 'queued' as const }]
      })))
      setRestoredAssetNames(current => current.filter(name => !selected.some(file => (file.webkitRelativePath || file.name) === name)))
      if (nextDocuments.prompt.trim())
        clearFieldError('prompt')
      const recognized = [nextDocuments.prompt !== documents.prompt, nextDocuments.readme !== documents.readme, nextDocuments.style !== documents.style].filter(Boolean).length
      const duplicateCount = nextAssets.filter(file => assets.some(current => fileIdentity(current) === fileIdentity(file))).length
      const addedCount = Math.max(0, nextAssets.length - duplicateCount - overflowCount)
      setImportNotice([
        recognized ? `已识别 ${recognized} 份文档` : '',
        addedCount ? `已加入 ${addedCount} 个资源` : '',
        duplicateCount ? `已忽略 ${duplicateCount} 个重复文件` : '',
        overflowCount ? `已忽略 ${overflowCount} 个超出数量上限的文件` : '',
        invalidFileCount ? `已忽略 ${invalidFileCount} 个空文件或超过 200MB 的文件` : '',
      ].filter(Boolean).join('，'))
    }
    catch {
      setError('部分文档无法读取，请确认文件编码和大小后重试。')
    }
    finally {
      setReadingFiles(false)
    }
  }

  const removeAsset = async (file: File) => {
    const key = fileIdentity(file)
    const uploaded = uploadedAssets[key]
    if (!uploaded || !submissionId) {
      setAssets(current => current.filter(item => item !== file))
      setAssetKeys(current => omitKey(current, key))
      setAssetStates(current => omitKey(current, key))
      markEditing()
      return
    }
    setRemovingAssetKey(key)
    try {
      await request(`/prompt-submissions/${submissionId}/assets/${uploaded.assetId}`, { method: 'DELETE' })
      setAssets(current => current.filter(item => item !== file))
      setAssetKeys(current => omitKey(current, key))
      setAssetStates(current => omitKey(current, key))
      setUploadedAssets(current => omitKey(current, key))
      setServerAssets(current => current.filter(asset => asset.id !== uploaded.assetId))
      markEditing()
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : `无法移除 ${file.name}，请稍后重试。`)
    }
    finally {
      setRemovingAssetKey('')
    }
  }

  const removeServerAsset = async (asset: PromptAsset) => {
    if (!submissionId)
      return
    setRemovingAssetKey(asset.id)
    try {
      await request(`/prompt-submissions/${submissionId}/assets/${asset.id}`, { method: 'DELETE' })
      setServerAssets(current => current.filter(item => item.id !== asset.id))
      setUploadedAssets(current => Object.fromEntries(Object.entries(current).filter(([, item]) => item.assetId !== asset.id)))
      markEditing()
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : `无法移除 ${asset.name}，请稍后重试。`)
    }
    finally {
      setRemovingAssetKey('')
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!serverAssetsVerified) {
      setError('正在核验已上传资源，请稍候再提交。')
      return
    }
    const nextFieldErrors = validateSubmission(metadata, effectivePrimaryCategoryId, documents)
    setFieldErrors(nextFieldErrors)
    const firstError = (['title', 'summary', 'category', 'prompt'] as FieldName[]).find(field => nextFieldErrors[field])
    if (firstError) {
      setError('请完成页面中标记的必填内容后再提交。')
      focusField(firstError)
      return
    }

    const payload: PromptSaveInput = {
      categoryIds: [effectivePrimaryCategoryId],
      compatibility: splitValues(metadata.compatibility),
      contentKind: kind,
      documents: buildDocuments(documents),
      featured: false,
      primaryCategoryId: effectivePrimaryCategoryId,
      slug: '',
      sort: 1,
      status: 'draft',
      summary: metadata.summary.trim(),
      tags: splitValues(metadata.tags),
      title: metadata.title.trim(),
    }

    setSubmitting(true)
    setUploadProgress(3)
    setUploadLabel(submissionId ? '正在同步原投稿草稿…' : '正在安全保存文字草稿…')
    const stableSubmissionKey = submissionKey || crypto.randomUUID()
    const stableAssetKeys = { ...assetKeys }
    assets.forEach((file) => {
      const key = fileIdentity(file)
      stableAssetKeys[key] ??= crypto.randomUUID()
    })
    if (!submissionKey)
      setSubmissionKey(stableSubmissionKey)
    setAssetKeys(stableAssetKeys)
    persistDraftImmediately({
      assetKeys: stableAssetKeys,
      assets,
      documents,
      kind,
      metadata,
      primaryCategoryId: effectivePrimaryCategoryId,
      submissionId,
      submissionKey: stableSubmissionKey,
      storageKey: draftStorageKey,
      uploadedAssets,
    })
    try {
      const created = await request<{ alreadySubmitted: boolean, id: string, reused: boolean }>('/prompt-submissions', {
        body: JSON.stringify({ ...payload, submissionKey: stableSubmissionKey }),
        method: 'POST',
      })
      const id = created.data.id
      setSubmissionId(id)
      if (created.data.alreadySubmitted) {
        clearDraft()
        setReceipt({ failedFiles: [], id, scanQueued: false })
        return
      }

      const failedFiles: string[] = []
      let nextUploadedAssets = { ...uploadedAssets }
      let hasPrimaryAsset = Object.values(nextUploadedAssets).some(item => item.isPrimary) || serverAssets.some(asset => asset.is_primary)

      for (const item of visibleLibraryAssets) {
        setUploadLabel(`正在关联素材：${item.name}`)
        try {
          const role = item.role
          const isPrimary = !hasPrimaryAsset && ['image', 'video', 'web_preview'].includes(role)
          const attached = await request<PromptAsset>(`/prompt-submissions/${id}/assets`, {
            body: JSON.stringify({ assetKey: crypto.randomUUID(), fileId: item.id, isPrimary, role }),
            method: 'POST',
          })
          setServerAssets(current => [...current.filter(asset => asset.id !== attached.data.id), attached.data])
          if (isPrimary)
            hasPrimaryAsset = true
        }
        catch (reason) {
          setError(reason instanceof Error ? reason.message : `无法使用素材 ${item.name}`)
          return
        }
      }
      const filesToUpload = assets.filter(file => !nextUploadedAssets[fileIdentity(file)])
      const completedBeforeStart = assets.length - filesToUpload.length

      for (const [index, file] of filesToUpload.entries()) {
        const key = fileIdentity(file)
        if (file.size <= 0 || file.size > 200 * 1024 * 1024) {
          failedFiles.push(file.name)
          setAssetStates(current => ({ ...current, [key]: { error: '文件为空或超过 200MB', progress: 0, status: 'failed' } }))
          continue
        }
        setUploadLabel(`正在上传 ${completedBeforeStart + index + 1}/${assets.length}：${file.name}`)
        setAssetStates(current => ({ ...current, [key]: { progress: 0, status: 'uploading' } }))
        try {
          const uploaded = await uploadCommunityPromptAsset(file, (fileProgress) => {
            const completed = completedBeforeStart + index
            const overall = assets.length ? 8 + ((completed + fileProgress / 100) / assets.length) * 84 : 92
            setUploadProgress(Math.round(overall))
            setAssetStates(current => ({ ...current, [key]: { progress: fileProgress, status: 'uploading' } }))
          })
          const role = assetRole(file)
          const isPrimary: boolean = !hasPrimaryAsset && ['image', 'video', 'web_preview'].includes(role)
          const attached = await request<PromptAsset>(`/prompt-submissions/${id}/assets`, {
            body: JSON.stringify({ assetKey: stableAssetKeys[key], fileId: uploaded.fileId, isPrimary, role }),
            method: 'POST',
          })
          nextUploadedAssets = { ...nextUploadedAssets, [key]: { assetId: attached.data.id, isPrimary, role } }
          setUploadedAssets(nextUploadedAssets)
          setServerAssets(current => [...current.filter(asset => asset.id !== attached.data.id), attached.data])
          setAssetStates(current => ({ ...current, [key]: { progress: 100, status: 'uploaded' } }))
          if (isPrimary)
            hasPrimaryAsset = true
        }
        catch (reason) {
          failedFiles.push(file.name)
          setAssetStates(current => ({
            ...current,
            [key]: {
              error: reason instanceof Error ? reason.message : '上传失败，请重试',
              progress: 0,
              status: 'failed',
            },
          }))
        }
      }

      if (failedFiles.length) {
        persistDraftImmediately({
          assetKeys: stableAssetKeys,
          assets,
          documents,
          kind,
          metadata,
          primaryCategoryId: effectivePrimaryCategoryId,
          submissionId: id,
          submissionKey: stableSubmissionKey,
          storageKey: draftStorageKey,
          uploadedAssets: nextUploadedAssets,
        })
        setError(`文字草稿和已完成资源均已保留。请重试 ${failedFiles.length} 个失败文件，或移除后再提交。`)
        return
      }

      setUploadLabel('正在完成投稿…')
      setUploadProgress(96)
      const completed = await request<{ id: string, security_scan_queued: boolean }>(`/prompt-submissions/${id}/complete`, { method: 'POST' })
      clearDraft()
      setUploadProgress(100)
      setReceipt({ failedFiles, id, scanQueued: completed.data.security_scan_queued })
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '投稿没有完成，请检查必填内容后重试。')
    }
    finally {
      setSubmitting(false)
      setUploadLabel('')
      setUploadProgress(0)
    }
  }

  if (receipt) {
    return (
      <div className="catalog-page catalog-page--prompt submission-success-page prompt-submit-page prompts-full-bleed">
        <div className="catalog-shell prompt-submit-success submission-success-card">
          <span className="prompt-submit-success-icon"><Check /></span>
          <p>投稿已完成</p>
          <h1>Prompt 投稿已提交</h1>
          <span>
            {receipt.scanQueued
              ? '自动安全检查已经开始。只有检测到可能危害设备或程序的风险时才需要人工介入，普通建议不会阻碍发布。'
              : '内容已经保存，管理员可直接在 Prompts 后台继续完善并发布。'}
          </span>
          {receipt.failedFiles.length
            ? (
                <div className="prompt-submit-warning">
                  以下资源没有上传成功，但文本投稿已经保留：
                  {receipt.failedFiles.join('、')}
                </div>
              )
            : null}
          <div className="prompt-submit-success-actions">
            <Link href="/prompts">返回 Prompts</Link>
            <button type="button" onClick={() => window.location.reload()}>再投稿一个</button>
          </div>
        </div>
      </div>
    )
  }

  const saveState = draftStatus === 'failed' ? 'error' : draftStatus === 'saved' || draftStatus === 'restored' ? 'saved' : draftStatus === 'saving' ? 'saving' : 'idle'
  const activeContent = activeDocument === 'prompt' ? documents.prompt : documents.readme
  const hasFailedAssets = Object.values(assetStates).some(state => state.status === 'failed')
  const submitLabel = submitting
    ? '正在提交…'
    : hasFailedAssets
      ? '重试失败文件并提交'
      : submissionId
        ? '继续原投稿并提交'
        : '提交到后台'

  return (
    <form id="prompt-editor-studio-form" noValidate onSubmit={submit} className="editor-studio-business-form">
      <MarkdownEditor
        key={editorVersion}
        documentHeader={(
          <EditorStudioDocumentHeader>
            <NativeField error={fieldErrors.title} fieldId="prompt-field-title" label="标题" required>
              <input
                aria-invalid={Boolean(fieldErrors.title)}
                id="prompt-field-title"
                name="title"
                maxLength={120}
                placeholder="无标题"
                required
                value={metadata.title}
                onChange={(event) => {
                  setMetadata(current => ({ ...current, title: event.target.value }))
                  clearFieldError('title')
                  markEditing()
                }}
              />
            </NativeField>
            <NativeField error={fieldErrors.summary} fieldId="prompt-field-summary" hint="说明用途、适合谁，以及最重要的输出结果。" label="一句话简介" required>
              <textarea
                aria-invalid={Boolean(fieldErrors.summary)}
                id="prompt-field-summary"
                name="summary"
                maxLength={500}
                placeholder="写一句精炼的摘要…"
                required
                rows={2}
                value={metadata.summary}
                onChange={(event) => {
                  setMetadata(current => ({ ...current, summary: event.target.value }))
                  clearFieldError('summary')
                  markEditing()
                }}
              />
            </NativeField>
          </EditorStudioDocumentHeader>
        )}
        label={activeDocument === 'prompt' ? '主提示词' : 'README / 使用说明'}
        maxLength={2_097_152}
        minRows={18}
        placeholder={activeDocument === 'prompt' ? '从这里开始编写主提示词…' : '说明适用场景、输入要求、使用步骤和示例…'}
        saveState={saveState}
        studio={{
          actions: (
            <>
              <Button type="button" size="sm" variant="tertiary" isDisabled={!isDirty || submitting} onPress={saveDraftNow}>保存草稿</Button>
              <Button type="submit" size="sm" variant="primary" isDisabled={readingFiles || !draftReady || !serverAssetsVerified} isPending={submitting}>
                {submitting ? <Spinner color="current" size="sm" /> : <CloudArrowUpIn />}
                {submitLabel}
              </Button>
            </>
          ),
          backHref: '/prompts',
          backLabel: 'Prompts',
          brand: 'Hi LLM Editorial',
          completion,
          documentLabel: metadata.title.trim() || '未命名 Prompt',
          documentNavigation: (
            <div aria-label="Prompt 文档" role="tablist">
              <button aria-selected={activeDocument === 'prompt'} role="tab" type="button" onClick={() => setActiveDocument('prompt')}>主提示词</button>
              <button aria-selected={activeDocument === 'readme'} role="tab" type="button" onClick={() => setActiveDocument('readme')}>README</button>
            </div>
          ),
          inspector: (
            <div>
              {restoredAssetNames.length
                ? (
                    <div role="status" className={styles.restoreNotice}>
                      已恢复文字草稿；请重新选择本地文件：
                      {restoredAssetNames.join('、')}
                    </div>
                  )
                : null}
              {error ? <div role="alert" className="prompt-submit-error">{error}</div> : null}
              {fieldErrors.prompt ? <p role="alert" className={styles.fieldError}>{fieldErrors.prompt}</p> : null}
              <EditorStudioSection title="内容定位" description="决定用户能否在目录里找到并理解它。">
                <NativeField label="内容类型" required>
                  <select
                    value={kind}
                    onChange={(event) => {
                      setKind(event.target.value as PromptContentKind)
                      clearFieldError('category')
                      markEditing()
                    }}
                  >
                    {PROMPT_CONTENT_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </NativeField>
                <NativeField error={fieldErrors.category} fieldId="prompt-field-category" label="主要分类" required>
                  <select
                    aria-invalid={Boolean(fieldErrors.category)}
                    id="prompt-field-category"
                    required
                    value={effectivePrimaryCategoryId}
                    onChange={(event) => {
                      setPrimaryCategoryId(event.target.value)
                      clearFieldError('category')
                      markEditing()
                    }}
                  >
                    {availableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </NativeField>
                <NativeField hint="用逗号分隔，便于搜索。" label="标签">
                  <input
                    name="tags"
                    placeholder="dashboard, b2b, dark-mode"
                    value={metadata.tags}
                    onChange={(event) => {
                      setMetadata(current => ({ ...current, tags: event.target.value }))
                      markEditing()
                    }}
                  />
                </NativeField>
                <NativeField hint="模型、框架、平台或设备。" label="适配范围">
                  <input
                    name="compatibility"
                    placeholder="Claude, GPT-5, React"
                    value={metadata.compatibility}
                    onChange={(event) => {
                      setMetadata(current => ({ ...current, compatibility: event.target.value }))
                      markEditing()
                    }}
                  />
                </NativeField>
              </EditorStudioSection>
              <EditorStudioSection title="样式与参数" defaultOpen={false} description="可选的 CSS、JSON、YAML 或设计 Token。">
                <NativeField label="样式 / 参数文件">
                  <textarea
                    placeholder="/* CSS, JSON, YAML or style tokens */"
                    rows={7}
                    value={documents.style}
                    onChange={(event) => {
                      setDocuments(current => ({ ...current, style: event.target.value }))
                      markEditing()
                    }}
                    className="font-mono"
                  />
                </NativeField>
              </EditorStudioSection>
              <EditorStudioSection title="展示封面" description="只用于列表和详情页展示，不会插入正文。">
                <MediaPicker
                  title="选择 Prompt 封面"
                  isDisabled={assets.length + visibleServerAssets.length + visibleLibraryAssets.length >= MAX_ASSETS}
                  accept="image/jpeg,image/png,image/webp"
                  buttonLabel={visibleLibraryAssets.some(asset => asset.role === 'cover') || visibleServerAssets.some(asset => asset.role === 'cover') ? '更换封面' : '选择封面'}
                  fullWidth
                  kind="image"
                  onSelect={item => addLibraryAsset(item, 'cover')}
                  onUpload={uploadCommunityPromptAsset}
                />
                {visibleLibraryAssets.filter(asset => asset.role === 'cover').map(item => (
                  <div key={`cover-library-${item.id}`} className="prompt-submit-files mt-2">
                    <div>
                      <Picture />
                      <span>
                        <strong>{item.name}</strong>
                        <small>素材库 · 展示封面</small>
                      </span>
                      <button
                        aria-label={`移除 ${item.name}`}
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setLibraryAssets(current => current.filter(asset => asset.id !== item.id))
                          markEditing()
                        }}
                      >
                        <TrashBin />
                      </button>
                    </div>
                  </div>
                ))}
                {visibleServerAssets.filter(asset => asset.role === 'cover').map(asset => (
                  <div key={`cover-server-${asset.id}`} className="prompt-submit-files mt-2">
                    <div>
                      <Picture />
                      <span>
                        <strong>{asset.name}</strong>
                        <small>已上传 · 展示封面</small>
                      </span>
                      <button aria-label={`移除 ${asset.name}`} type="button" disabled={submitting || removingAssetKey === asset.id} onClick={() => void removeServerAsset(asset)}><TrashBin /></button>
                    </div>
                  </div>
                ))}
              </EditorStudioSection>
              <EditorStudioSection title="附件与项目文件" defaultOpen={false} description="文档、数据和项目目录放在这里；正文图片请使用正文工具栏。">
                <div className="prompt-submit-import-actions">
                  <MediaPicker
                    title="选择附件与项目文件"
                    isDisabled={assets.length + visibleServerAssets.length + visibleLibraryAssets.length >= MAX_ASSETS}
                    accept=".zip,.html,.htm,.css,.scss,.less,.json,.yaml,.yml,.md,.markdown,.txt,.pdf"
                    buttonLabel="选择附件"
                    kind="all"
                    onSelect={item => addLibraryAsset(item, 'attachment')}
                    onUpload={uploadCommunityPromptAsset}
                  />
                  <label>
                    <CloudArrowUpIn />
                    选择文件
                    <input type="file" accept="image/*,video/*,.zip,.html,.htm,.css,.scss,.less,.json,.yaml,.yml,.md,.markdown,.txt" hidden multiple onChange={event => void importFiles(event)} />
                  </label>
                  <label>
                    <FolderOpen />
                    选择文件夹
                    <input ref={folderRef} type="file" hidden multiple onChange={event => void importFiles(event)} />
                  </label>
                </div>
                <span className="prompt-submit-import-limit">{readingFiles ? '正在识别文档…' : '最多 12 个资源，单个不超过 200MB'}</span>
                {importNotice ? <p aria-live="polite" className="prompt-submit-import-notice">{importNotice}</p> : null}
                {assets.length || visibleServerAssets.some(asset => asset.role !== 'cover') || visibleLibraryAssets.some(asset => asset.role !== 'cover')
                  ? (
                      <div className="prompt-submit-files">
                        {visibleLibraryAssets.filter(item => item.role !== 'cover').map(item => (
                          <div key={`library-${item.id}`}>
                            <File />
                            <span>
                              <strong>{item.name}</strong>
                              <small>
                                {formatBytes(item.sizeBytes)}
                                {' · '}
                                <span className={`${styles.fileStatus} ${assetStatusClass('uploaded')}`}>素材库</span>
                              </small>
                            </span>
                            <button
                              aria-label={`移除 ${item.name}`}
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setLibraryAssets(current => current.filter(asset => asset.id !== item.id))
                                markEditing()
                              }}
                            >
                              <TrashBin />
                            </button>
                          </div>
                        ))}
                        {assets.map((file) => {
                          const key = fileIdentity(file)
                          const state: AssetUploadState = assetStates[key] ?? { progress: uploadedAssets[key] ? 100 : 0, status: uploadedAssets[key] ? 'uploaded' : 'queued' }
                          return (
                            <div key={key}>
                              <File />
                              <span>
                                <strong>{file.webkitRelativePath || file.name}</strong>
                                <small>
                                  {formatBytes(file.size)}
                                  {' '}
                                  ·
                                  {' '}
                                  <span className={`${styles.fileStatus} ${assetStatusClass(state.status)}`}>{assetStatusLabel(state)}</span>
                                </small>
                              </span>
                              <button aria-label={`移除 ${file.name}`} type="button" disabled={submitting || removingAssetKey === key} onClick={() => void removeAsset(file)} className={removingAssetKey === key ? styles.removePending : undefined}><TrashBin /></button>
                            </div>
                          )
                        })}
                        {visibleServerAssets.filter(asset => asset.role !== 'cover').map(asset => (
                          <div key={`server-${asset.id}`}>
                            <File />
                            <span>
                              <strong>{asset.source_path || asset.name}</strong>
                              <small>
                                {asset.size_bytes ? `${formatBytes(Number(asset.size_bytes))} · ` : ''}
                                <span className={`${styles.fileStatus} ${assetStatusClass('uploaded')}`}>已上传</span>
                              </small>
                            </span>
                            <button aria-label={`移除 ${asset.name}`} type="button" disabled={submitting || removingAssetKey === asset.id} onClick={() => void removeServerAsset(asset)} className={removingAssetKey === asset.id ? styles.removePending : undefined}><TrashBin /></button>
                          </div>
                        ))}
                      </div>
                    )
                  : <div className="prompt-submit-file-empty">暂无资源文件</div>}
              </EditorStudioSection>
              <EditorStudioSection title="提交检查" defaultOpen={false}>
                <p className="text-xs text-muted">{documents.prompt.trim() ? '主提示词已填写' : '还需要填写主提示词'}</p>
                <p className="text-xs text-muted">{assets.length + visibleServerAssets.length + visibleLibraryAssets.length ? `已选择 ${assets.length + visibleServerAssets.length + visibleLibraryAssets.length} 个资源` : '未添加资源（可选）'}</p>
                {hasFailedAssets
                  ? (
                      <div role="status" className={styles.failurePanel}>
                        <strong>需要处理的文件</strong>
                        <ul>
                          {assets.filter(file => assetStates[fileIdentity(file)]?.status === 'failed').map(file => (
                            <li key={fileIdentity(file)}>
                              {file.name}
                              ：
                              {assetStates[fileIdentity(file)]?.error || '上传失败'}
                            </li>
                          ))}
                        </ul>
                        <span>再次提交只重试失败文件。</span>
                      </div>
                    )
                  : null}
                {submitting && uploadLabel
                  ? (
                      <div aria-live="polite" className="prompt-submit-progress">
                        <span className={styles.progressHeader}>
                          <span>{uploadLabel}</span>
                          <b>
                            {uploadProgress}
                            %
                          </b>
                        </span>
                        <div><i style={{ width: `${uploadProgress}%` }} /></div>
                      </div>
                    )
                  : null}
                <p className="prompt-submit-policy">提交即表示你确认内容可公开分享，并有权提供相关提示词与资源。</p>
              </EditorStudioSection>
            </div>
          ),
          inspectorFooter: (
            <>
              <Button type="button" variant="secondary" isDisabled={!isDirty || submitting} onPress={saveDraftNow}>保存草稿</Button>
              <Button type="submit" variant="primary" isDisabled={readingFiles || !draftReady || !serverAssetsVerified} isPending={submitting}>
                {submitting ? <Spinner color="current" size="sm" /> : <CloudArrowUpIn />}
                {submitLabel}
              </Button>
            </>
          ),
          discardAction: <Button type="button" variant="ghost" isDisabled={submitting} onPress={discardDraft}>清除本机草稿</Button>,
          inspectorTitle: 'Prompt 发布设置',
          statusLabel: draftStatusLabel(draftStatus),
          statusTone: draftStatus === 'failed' ? 'danger' : draftStatus === 'saving' ? 'saving' : draftStatus === 'saved' || draftStatus === 'restored' ? 'success' : 'neutral',
        }}
        value={activeContent}
        onChange={(next) => {
          setDocuments(current => activeDocument === 'prompt' ? { ...current, prompt: next } : { ...current, readme: next })
          if (activeDocument === 'prompt')
            clearFieldError('prompt')
          markEditing()
        }}
        onSaveShortcut={saveDraftNow}
      />
    </form>
  )
}

function assetRole(file: File): PromptAssetRole {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (file.type.startsWith('image/'))
    return 'image'
  if (file.type.startsWith('video/'))
    return 'video'
  if (file.type === 'text/html' || extension === 'html' || extension === 'htm')
    return 'web_preview'
  if (extension === 'zip')
    return 'source_package'
  return 'attachment'
}

function assetStatusClass(status: UploadStatus) {
  if (status === 'failed')
    return styles.fileFailed
  if (status === 'uploaded')
    return styles.fileUploaded
  if (status === 'uploading')
    return styles.fileUploading
  return ''
}

function assetStatusLabel(state: AssetUploadState) {
  if (state.status === 'failed')
    return '上传失败'
  if (state.status === 'uploaded')
    return '已上传'
  if (state.status === 'uploading')
    return `上传中 ${Math.round(state.progress)}%`
  return '等待上传'
}

function assignImportedDocument(target: ImportedDocuments, fileName: string, sourcePath: string, content: string) {
  const lower = sourcePath.toLowerCase()
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (lower.includes('readme')) {
    target.readme = content
    target.readmePath = sourcePath
    return true
  }
  if (['css', 'scss', 'less', 'json', 'yaml', 'yml'].includes(extension) || /style|token|theme|parameter/.test(lower)) {
    target.style = content
    target.stylePath = sourcePath
    return true
  }
  if (/(?:prompt|system|instruction|skill)\.(?:md|markdown|txt)$/.test(lower) || (!target.prompt && ['md', 'markdown', 'txt'].includes(extension))) {
    target.prompt = content
    target.promptPath = sourcePath
    return true
  }
  if (!target.readme && ['md', 'markdown', 'txt'].includes(extension)) {
    target.readme = content
    target.readmePath = sourcePath
    return true
  }
  return false
}

function buildDocuments(value: ImportedDocuments): PromptDocumentInput[] {
  const documents: PromptDocumentInput[] = [{
    content: value.prompt,
    isPrimary: true,
    language: 'markdown',
    name: value.promptPath.split('/').pop() || 'Prompt',
    role: 'prompt',
    sourcePath: normalizeDocumentPath(value.promptPath, 'prompts/prompt.md'),
  }]
  if (value.readme.trim()) {
    documents.push({
      content: value.readme,
      isPrimary: false,
      language: 'markdown',
      name: value.readmePath.split('/').pop() || 'README',
      role: 'readme',
      sourcePath: normalizeDocumentPath(value.readmePath, 'README.md'),
    })
  }
  if (value.style.trim()) {
    documents.push({
      content: value.style,
      isPrimary: false,
      language: value.stylePath.endsWith('.json') ? 'json' : 'css',
      name: value.stylePath.split('/').pop() || 'Style',
      role: 'style',
      sourcePath: normalizeDocumentPath(value.stylePath, 'styles/style.css'),
    })
  }
  return documents
}

function categoryBelongsToKind(category: PromptCategory, categories: PromptCategory[], kind: PromptContentKind) {
  let current: PromptCategory | undefined = category
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.kind)
      return current.kind === 'general' || current.kind === kind
    current = categories.find(item => item.id === current?.parent_id)
  }
  return false
}

function draftStatusLabel(status: DraftStatus) {
  if (status === 'failed')
    return '自动保存失败，请勿关闭页面'
  if (status === 'restored')
    return '已恢复上次文字草稿'
  if (status === 'saving')
    return '正在自动保存草稿…'
  if (status === 'idle')
    return '填写后会自动保存文字草稿'
  return '文字草稿已自动保存'
}

function fileIdentity(file: File) {
  return `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`
}

function focusField(field: FieldName) {
  window.requestAnimationFrame(() => {
    const target = document.getElementById(`prompt-field-${field}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = target?.matches('input, select, textarea, [contenteditable="true"]')
      ? target
      : target?.querySelector<HTMLElement>('input, select, textarea, [contenteditable="true"]')
    if (focusable instanceof HTMLElement)
      focusable.focus({ preventScroll: true })
  })
}

function formatBytes(value: number) {
  if (value < 1024)
    return `${value} B`
  if (value < 1024 * 1024)
    return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function mergeFiles(current: File[], incoming: File[]) {
  const byIdentity = new Map(current.map(file => [fileIdentity(file), file]))
  incoming.filter(file => file.size > 0 && file.size <= 200 * 1024 * 1024).forEach(file => byIdentity.set(fileIdentity(file), file))
  return [...byIdentity.values()]
}

function NativeField({ children, className = '', error, fieldId, hint, label, required }: { children: React.ReactNode, className?: string, error?: string, fieldId?: string, hint?: string, label: string, required?: boolean }) {
  return (
    <label htmlFor={fieldId} className={`prompt-submit-field ${error ? styles.fieldInvalid : ''} ${className}`}>
      <span>
        {label}
        {required ? <i> *</i> : null}
      </span>
      {children}
      {error ? <strong role="alert" className={styles.fieldError}>{error}</strong> : null}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function normalizeDocumentPath(value: string, fallback: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\.?\//, '').split('/').filter(segment => segment && segment !== '.' && segment !== '..').join('/')
  return normalized || fallback
}

function omitKey<Value>(value: Record<string, Value>, key: string) {
  const next = { ...value }
  delete next[key]
  return next
}

function persistDraftImmediately(input: {
  assetKeys: Record<string, string>
  assets: File[]
  documents: ImportedDocuments
  kind: PromptContentKind
  metadata: SubmissionMetadata
  primaryCategoryId: string
  submissionId: string
  submissionKey: string
  storageKey: string
  uploadedAssets: Record<string, { assetId: string, isPrimary: boolean, role: string }>
}): boolean {
  try {
    writePromptSubmissionDraft(window.localStorage, input.storageKey, {
      assetKeys: input.assetKeys,
      documents: input.documents,
      kind: input.kind,
      metadata: input.metadata,
      pendingAssetNames: input.assets.filter(file => !input.uploadedAssets[fileIdentity(file)]).map(file => file.webkitRelativePath || file.name),
      primaryCategoryId: input.primaryCategoryId,
      submissionId: input.submissionId,
      submissionKey: input.submissionKey,
      uploadedAssets: input.uploadedAssets,
    })
    return true
  }
  catch {
    // The normal autosave status reports storage failures without interrupting submission.
    return false
  }
}

function splitValues(value: string) {
  return [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]
}

function validateSubmission(metadata: SubmissionMetadata, primaryCategoryId: string, documents: ImportedDocuments) {
  const issues: Partial<Record<FieldName, string>> = {}
  if (!metadata.title.trim())
    issues.title = '请填写标题，让用户知道这份内容解决什么问题。'
  if (!metadata.summary.trim())
    issues.summary = '请填写一句话简介。'
  if (!primaryCategoryId)
    issues.category = '当前类型没有可用分类，请联系管理员先配置 Prompts 分类。'
  if (!documents.prompt.trim())
    issues.prompt = '请填写主提示词，或从文件 / 文件夹导入提示词文档。'
  return issues
}

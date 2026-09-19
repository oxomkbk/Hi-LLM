'use client'

import {
  Check,
  Eye,
  PaperPlane,
  Person,
  ShieldCheck,
  Xmark,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Description,
  Disclosure,
  Drawer,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Spinner,
  Switch,
  TextArea,
  TextField,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EditorStudioDocumentHeader, EditorStudioSection } from '@/components/authoring/editor-studio'
import { getAuthoringCompletion } from '@/components/authoring/workspace-model'
import CatalogIconField from '@/components/catalog/catalog-icon-field'
import MarkdownEditor from '@/components/content/markdown-editor'
import TagInputs from '@/components/ui/tag-inputs'
import { MCP_CAPABILITIES, MCP_CATEGORIES, MCP_CLIENTS, MCP_PROTOCOL_VERSIONS } from '@/lib/mcps'

import McpInstallationEditor from './mcp-installation-editor'
import McpLivePreview from './mcp-live-preview'
import { installationDraftHasUnsafeSecret, parseConfigTemplate } from './types'

import type { McpComposerMode, McpComposerValue, McpSubmitIntent } from './types'
import type { FormEvent } from 'react'

const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1_000

interface ComposerValidationIssue {
  message: string
  targetId: string
}

interface FieldGroupProps {
  isReadOnly: boolean
  patch: <Key extends keyof McpComposerValue>(key: Key, value: McpComposerValue[Key]) => void
  value: McpComposerValue
}

interface McpComposerProps {
  asideContent?: React.ReactNode
  backHref: string
  baseUpdatedAt?: string
  draftKey?: string
  draftStorage?: 'local' | 'session'
  error?: string | null
  initialValue: McpComposerValue
  isReadOnly?: boolean
  isSubmitting?: boolean
  mode: McpComposerMode
  onSubmit: (value: McpComposerValue, intent: McpSubmitIntent, reviewNote?: string) => Promise<boolean>
  primaryActionDisabled?: boolean
  primaryActionHint?: string
  primaryActionLabel?: string
  reviewNote?: string
  title: string
}

export default function McpComposer({
  asideContent,
  backHref,
  baseUpdatedAt,
  draftKey,
  draftStorage = 'local',
  error,
  initialValue,
  isReadOnly = false,
  isSubmitting = false,
  mode,
  onSubmit,
  primaryActionDisabled = false,
  primaryActionHint,
  primaryActionLabel,
  reviewNote: initialReviewNote = '',
  title,
}: McpComposerProps) {
  const initialSignature = JSON.stringify(initialValue)
  const stableInitialValue = useMemo<McpComposerValue>(() => JSON.parse(initialSignature) as McpComposerValue, [initialSignature])
  const [value, setValue] = useState(stableInitialValue)
  const [reviewNote, setReviewNote] = useState(initialReviewNote)
  const [localIssue, setLocalIssue] = useState<ComposerValidationIssue | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [publisherExpanded, setPublisherExpanded] = useState(mode === 'submission' || mode === 'submission-review')
  const [draftReady, setDraftReady] = useState(!draftKey)
  const [draftStatus, setDraftStatus] = useState<'failed' | 'paused' | 'restored' | 'saved' | 'unsaved'>('saved')
  const currentSignature = useMemo(() => JSON.stringify(value), [value])
  const isDirty = currentSignature !== initialSignature
  const draftSafe = useMemo(() => value.installations.every(item => !installationDraftHasUnsafeSecret(item)), [value.installations])
  const effectiveDraftStatus = !draftSafe && isDirty ? 'paused' : draftStatus
  const policy = composerPolicy(mode)
  const contentRequiresRescan = mode === 'submission-review' && isDirty
  const effectivePrimaryDisabled = primaryActionDisabled || contentRequiresRescan || iconUploading
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(value.name.trim()) },
    { completed: Boolean(value.summary.trim()) },
    { completed: Boolean(value.description.trim()) },
    { completed: Boolean(value.category) },
    { completed: value.capabilities.length > 0 },
    { completed: value.clients.length > 0 },
    { completed: value.installations.length > 0 },
    { completed: Boolean(value.source_url.trim()) },
  ]), [value.capabilities.length, value.category, value.clients.length, value.description, value.installations.length, value.name, value.source_url, value.summary])

  const patch = useCallback(<Key extends keyof McpComposerValue>(key: Key, next: McpComposerValue[Key]) => {
    setValue(current => ({ ...current, [key]: next }))
    setDraftStatus('unsaved')
    setLocalIssue(null)
  }, [])

  const saveDraftNow = useCallback(() => {
    if (!draftKey || !isDirty || isReadOnly || !draftSafe)
      return
    try {
      const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
      storage.setItem(draftKey, JSON.stringify({ baseUpdatedAt: baseUpdatedAt ?? null, expiresAt: Date.now() + DRAFT_TTL_MS, savedAt: Date.now(), value, version: DRAFT_VERSION }))
      setDraftStatus('saved')
    }
    catch {
      setDraftStatus('failed')
    }
  }, [baseUpdatedAt, draftKey, draftSafe, draftStorage, isDirty, isReadOnly, value])

  /* eslint-disable react/set-state-in-effect -- browser drafts are restored after hydration */
  useEffect(() => {
    if (!draftKey)
      return
    const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
    try {
      const legacyKey = legacyDraftKey(draftKey)
      const currentDraft = storage.getItem(draftKey)
      const rawDraft = currentDraft ?? (legacyKey ? storage.getItem(legacyKey) : null)
      const restored = readDraft(rawDraft, baseUpdatedAt)
      if (restored) {
        if (!currentDraft && rawDraft && legacyKey) {
          storage.setItem(draftKey, rawDraft)
          storage.removeItem(legacyKey)
        }
        setValue({ ...stableInitialValue, ...restored })
        setDraftStatus('restored')
      }
    }
    catch {
      setDraftStatus('failed')
    }
    finally {
      setDraftReady(true)
    }
  }, [baseUpdatedAt, draftKey, draftStorage, stableInitialValue])
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    if (!draftKey || !draftReady || !isDirty)
      return
    if (!draftSafe)
      return
    const timeout = window.setTimeout(() => {
      const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
      try {
        storage.setItem(draftKey, JSON.stringify({ baseUpdatedAt: baseUpdatedAt ?? null, expiresAt: Date.now() + DRAFT_TTL_MS, savedAt: Date.now(), value, version: DRAFT_VERSION }))
        setDraftStatus('saved')
      }
      catch {
        setDraftStatus('failed')
      }
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [baseUpdatedAt, draftKey, draftReady, draftSafe, draftStorage, isDirty, value])

  useEffect(() => {
    if (!isDirty || isReadOnly)
      return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, isReadOnly])

  const clearDraft = () => {
    if (!draftKey)
      return
    try {
      const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
      storage.removeItem(draftKey)
      const legacyKey = legacyDraftKey(draftKey)
      if (legacyKey)
        storage.removeItem(legacyKey)
    }
    catch {
      // Successful writes must not fail because browser storage is unavailable.
    }
  }

  const discardDraft = () => {
    // eslint-disable-next-line no-alert -- an explicit destructive discard needs a synchronous confirmation
    if (!draftKey || !window.confirm('清除本机草稿？此操作会丢弃当前未提交的修改。'))
      return
    clearDraft()
    setValue(stableInitialValue)
    setReviewNote(initialReviewNote)
    setDraftStatus('saved')
    setLocalIssue(null)
  }

  const submit = async (intent: McpSubmitIntent) => {
    if (isReadOnly || isSubmitting)
      return
    if (iconUploading) {
      setLocalIssue({ message: '图标正在上传，请等待完成后再保存', targetId: 'mcp-field-icon' })
      requestAnimationFrame(() => focusValidationTarget('mcp-field-icon'))
      return
    }
    if (intent === policy.primaryIntent && effectivePrimaryDisabled) {
      setLocalIssue({
        message: contentRequiresRescan ? '请先保存修改，系统会自动重新检查当前内容' : primaryActionHint ?? '完成当前安全检查后即可发布',
        targetId: 'submission-publish-status',
      })
      requestAnimationFrame(() => focusValidationTarget('submission-publish-status'))
      return
    }
    const submissionValue = mode === 'admin-create' || mode === 'admin-edit'
      ? { ...value, status: 'published' as const }
      : value
    const validationError = validateComposer(submissionValue, intent, reviewNote)
    if (validationError) {
      setLocalIssue(validationError)
      if (validationError.targetId === 'mcp-field-publisher')
        setPublisherExpanded(true)
      requestAnimationFrame(() => requestAnimationFrame(() => focusValidationTarget(validationError.targetId)))
      return
    }
    const saved = await onSubmit(submissionValue, intent, reviewNote)
    if (saved)
      clearDraft()
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit(policy.primaryIntent)
  }

  const visibleError = localIssue?.message ?? error

  return (
    <>
      <Form aria-label={title} validationBehavior="aria" onSubmit={onFormSubmit} className="editor-studio-business-form">
        <MarkdownEditor
          id="mcp-field-description"
          name="description"
          documentHeader={(
            <EditorStudioDocumentHeader>
              <TextField
                isReadOnly={isReadOnly}
                isRequired
                fullWidth
                maxLength={100}
                value={value.name}
                onChange={next => patch('name', next)}
              >
                <Label>MCP Server 名称</Label>
                <Input id="mcp-field-name" variant="secondary" placeholder="例如：GitHub Repository MCP" />
                <Description>使用服务或能力名称。</Description>
                <FieldError />
              </TextField>
              <TextField
                isReadOnly={isReadOnly}
                isRequired
                fullWidth
                maxLength={240}
                value={value.summary}
                onChange={next => patch('summary', next.slice(0, 240))}
              >
                <div className="flex items-center justify-between gap-3">
                  <Label>一句话简介</Label>
                  <span className="text-xs text-muted">
                    {value.summary.length}
                    /240
                  </span>
                </div>
                <TextArea id="mcp-field-summary" variant="secondary" placeholder="说明它提供什么能力、适合什么场景。" rows={2} />
                <FieldError />
              </TextField>
            </EditorStudioDocumentHeader>
          )}
          label="完整说明"
          maxLength={8000}
          minRows={18}
          placeholder="介绍能力、可用工具、前置条件、连接步骤与注意事项。可直接粘贴 Markdown 或网页内容。"
          readOnly={isReadOnly}
          required
          saveState={effectiveDraftStatus === 'failed' ? 'error' : effectiveDraftStatus === 'saved' || effectiveDraftStatus === 'restored' ? 'saved' : 'idle'}
          studio={{
            actions: (
              <>
                <Button type="button" size="sm" variant="tertiary" onPress={() => setPreviewOpen(true)}>
                  <Eye />
                  预览
                </Button>
                {!isReadOnly
                  ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        isDisabled={isSubmitting || iconUploading}
                        isPending={isSubmitting || iconUploading}
                        onPress={() => void submit(policy.primaryIntent)}
                      >
                        {isSubmitting || iconUploading ? <Spinner color="current" size="sm" /> : policy.primaryIntent === 'submit' ? <PaperPlane /> : <Check />}
                        {isSubmitting ? '处理中…' : primaryActionLabel ?? policy.primaryLabel}
                      </Button>
                    )
                  : null}
              </>
            ),
            backHref,
            backLabel: 'MCP',
            brand: mode.startsWith('admin') ? 'Hi LLM Admin' : 'Hi LLM Editorial',
            brandHref: mode.startsWith('admin') ? '/admin' : '/',
            completion,
            documentLabel: value.name.trim() || title,
            inspector: (
              <div className="mcp-editor-inspector">
                {visibleError
                  ? (
                      <Alert role="alert" status="danger">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>还有内容需要处理</Alert.Title>
                          <Alert.Description>{visibleError}</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )
                  : null}
                {effectiveDraftStatus === 'paused'
                  ? (
                      <Alert status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>自动保存已暂停</Alert.Title>
                          <Alert.Description>高级配置含有无效或明文敏感值，请改用环境变量。</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )
                  : null}
                {isReadOnly
                  ? (
                      <Alert status="default">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>只读内容</Alert.Title>
                          <Alert.Description>该投稿已完成审核。</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )
                  : null}
                {policy.showSlug
                  ? (
                      <EditorStudioSection title="页面地址" description="公开详情页使用的固定地址。">
                        <TextField
                          isReadOnly={isReadOnly}
                          isRequired
                          fullWidth
                          maxLength={80}
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          value={value.slug}
                          onChange={next => patch('slug', next)}
                        >
                          <Label>Slug</Label>
                          <Input variant="secondary" placeholder="github-repository-mcp" spellCheck={false} />
                          <FieldError>仅支持小写字母、数字和连字符</FieldError>
                        </TextField>
                      </EditorStudioSection>
                    )
                  : null}
                <EditorStudioSection title="发现与兼容" description="用于目录筛选和客户端兼容判断。"><DiscoveryFields isReadOnly={isReadOnly} patch={patch} uploadMode={mode === 'submission' ? 'submission' : 'admin'} value={value} onIconBusyChange={setIconUploading} /></EditorStudioSection>
                <EditorStudioSection title="安装与连接" description="分别配置每一种可用的连接方式。"><div id="mcp-field-installations" tabIndex={-1}><McpInstallationEditor isReadOnly={isReadOnly} value={value.installations} onChange={next => patch('installations', next)} /></div></EditorStudioSection>
                <EditorStudioSection title="来源与协议" defaultOpen={false} description="用于核验、安全评测与协议兼容。"><SourceFields isReadOnly={isReadOnly} patch={patch} value={value} /></EditorStudioSection>
                <EditorStudioSection title="发布者与投稿人" defaultOpen={false} description="发布者公开展示，投稿邮箱只用于审核。">
                  <Disclosure isExpanded={publisherExpanded} onExpandedChange={setPublisherExpanded}>
                    <Disclosure.Heading>
                      <Button variant="ghost" slot="trigger" className="h-auto w-full justify-between px-0 py-2 text-left">
                        <span className="flex items-center gap-2">
                          <Person className="size-4" />
                          编辑发布者信息
                        </span>
                        <Disclosure.Indicator />
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content><Disclosure.Body className="pt-3"><PublisherFields isReadOnly={isReadOnly} patch={patch} policy={policy} value={value} /></Disclosure.Body></Disclosure.Content>
                  </Disclosure>
                </EditorStudioSection>
                <EditorStudioSection title="发布与审核">
                  {policy.showPublishSettings
                    ? <PublishPanel isReadOnly={isReadOnly} patch={patch} value={value} />
                    : (
                        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                          提交后进入后台审核与安全评测；平台不会连接或执行第三方服务。
                        </p>
                      )}
                  {asideContent}
                  {mode === 'submission-review'
                    ? (
                        <TextField
                          isReadOnly={isReadOnly}
                          fullWidth
                          maxLength={500}
                          value={reviewNote}
                          onChange={(next) => {
                            setReviewNote(next)
                            setLocalIssue(null)
                          }}
                        >
                          <Label>审核备注</Label>
                          <TextArea id="mcp-field-review-note" variant="secondary" placeholder="拒绝时必须填写具体原因。" rows={4} />
                          <Description>通过时可留空。</Description>
                        </TextField>
                      )
                    : null}
                </EditorStudioSection>
              </div>
            ),
            inspectorFooter: isReadOnly
              ? null
              : (
                  <>
                    {mode === 'submission-review'
                      ? (
                          <Button type="button" variant="danger" isDisabled={isSubmitting || iconUploading} onPress={() => void submit('reject')}>
                            <Xmark />
                            拒绝
                          </Button>
                        )
                      : null}
                    {draftKey ? <Button type="button" variant="secondary" isDisabled={!isDirty || isSubmitting || !draftSafe} onPress={saveDraftNow}>保存草稿</Button> : null}
                    {mode === 'submission-review' ? <Button type="button" variant="secondary" isDisabled={isSubmitting || iconUploading} onPress={() => void submit('save')}>保存修改</Button> : null}
                    <Button type="button" variant="primary" isDisabled={isSubmitting || iconUploading} isPending={isSubmitting || iconUploading} onPress={() => void submit(policy.primaryIntent)}>
                      {policy.primaryIntent === 'submit' ? <PaperPlane /> : <Check />}
                      {contentRequiresRescan ? '先保存修改' : primaryActionLabel ?? policy.primaryLabel}
                    </Button>
                  </>
                ),
            discardAction: draftKey && !isReadOnly
              ? <Button type="button" variant="ghost" isDisabled={isSubmitting} onPress={discardDraft}>清除本机草稿</Button>
              : null,
            inspectorTitle: 'MCP 发布设置',
          }}
          value={value.description}
          onChange={next => patch('description', next)}
          onSaveShortcut={isReadOnly ? undefined : saveDraftNow}
        />
      </Form>
      <Drawer.Backdrop isOpen={previewOpen} onOpenChange={setPreviewOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger aria-label="关闭页面预览" onPress={() => setPreviewOpen(false)} />
            <Drawer.Header><Drawer.Heading>页面预览</Drawer.Heading></Drawer.Header>
            <Drawer.Body className="bg-surface-secondary/35 p-4"><McpLivePreview value={value} /></Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}

function ChoiceGroup({ id, isReadOnly, onChange, options, required, selected, title }: { id: string, isReadOnly: boolean, onChange: (value: string[]) => void, options: readonly string[], required?: boolean, selected: string[], title: string }) {
  return (
    <div id={id} tabIndex={-1} className="sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label isRequired={required}>{title}</Label>
        <span className="text-xs text-muted">
          已选
          {selected.length}
          {' '}
          项
        </span>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-secondary/45 p-3">
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <Button
              key={option}
              aria-pressed={active}
              type="button"
              size="sm"
              variant={active ? 'secondary' : 'outline'}
              isDisabled={isReadOnly}
              onPress={() => onChange(active ? selected.filter(item => item !== option) : [...selected, option])}
            >
              {active ? <Check className="size-3.5" /> : null}
              {option}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function composerPolicy(mode: McpComposerMode) {
  return {
    primaryIntent: mode === 'submission' ? 'submit' as const : mode === 'submission-review' ? 'approve' as const : 'save' as const,
    primaryLabel: mode === 'submission' ? '提交审核' : mode === 'submission-review' ? '通过并发布' : mode === 'admin-create' ? '发布 MCP' : '保存更新',
    showPublishSettings: mode === 'admin-create' || mode === 'admin-edit',
    showSlug: mode !== 'submission',
    showSubmitter: mode === 'submission' || mode === 'submission-review',
  }
}

function DiscoveryFields({ isReadOnly, onIconBusyChange, patch, uploadMode, value }: FieldGroupProps & { onIconBusyChange: (busy: boolean) => void, uploadMode: 'admin' | 'submission' }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div id="mcp-field-category">
        <Select
          aria-label="MCP 分类"
          variant="secondary"
          isDisabled={isReadOnly}
          isRequired
          value={value.category}
          onChange={key => patch('category', String(key))}
        >
          <Label>分类</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {MCP_CATEGORIES.map(category => (
                <ListBox.Item key={category} id={category}>
                  {category}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <CatalogIconField
          name={value.name}
          kind="mcp"
          readOnly={isReadOnly}
          uploadMode={uploadMode}
          value={value.icon}
          onBusyChange={onIconBusyChange}
          onChange={next => patch('icon', next)}
        />
      </div>
      <ChoiceGroup
        id="mcp-field-capabilities"
        title="能力"
        isReadOnly={isReadOnly}
        options={MCP_CAPABILITIES}
        required
        selected={value.capabilities}
        onChange={next => patch('capabilities', next)}
      />
      <ChoiceGroup
        id="mcp-field-clients"
        title="兼容客户端"
        isReadOnly={isReadOnly}
        options={MCP_CLIENTS}
        required
        selected={value.clients}
        onChange={next => patch('clients', next)}
      />
      <div className="sm:col-span-2"><TagInputs appearance="submission" disabled={isReadOnly} maxTags={10} value={value.tags} onChange={tags => patch('tags', tags.slice(0, 10))} /></div>
    </div>
  )
}

function focusValidationTarget(targetId: string) {
  const target = document.getElementById(targetId)
  if (!target)
    return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const focusable = target.matches('input, textarea, button, [tabindex]:not([tabindex="-1"])')
    ? target
    : target.querySelector<HTMLElement>('input, textarea, button, [tabindex]:not([tabindex="-1"])')
  ;(focusable as HTMLElement | null)?.focus({ preventScroll: true })
}

function legacyDraftKey(key: string) {
  return key.startsWith('hillm-nav:') ? key.replace(/^hillm-nav:/, 'better-nav:') : null
}

function PublisherFields({ isReadOnly, patch, policy, value }: FieldGroupProps & { policy: ReturnType<typeof composerPolicy> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        isReadOnly={isReadOnly}
        isRequired
        fullWidth
        maxLength={80}
        value={value.publisher_name}
        onChange={next => patch('publisher_name', next)}
      >
        <Label>发布者名称</Label>
        <Input id="mcp-field-publisher" variant="secondary" placeholder="个人、团队或组织名称" />
        <FieldError />
      </TextField>
      <TextField type="url" isReadOnly={isReadOnly} fullWidth value={value.publisher_url} onChange={next => patch('publisher_url', next)}>
        <Label>发布者主页（可选）</Label>
        <Input variant="secondary" placeholder="https://example.com" spellCheck={false} />
        <FieldError />
      </TextField>
      {policy.showSubmitter
        ? (
            <TextField isReadOnly={isReadOnly} fullWidth maxLength={80} value={value.submitter_name} onChange={next => patch('submitter_name', next)}>
              <Label>投稿人名称（可选）</Label>
              <Input variant="secondary" placeholder="默认使用发布者名称" />
            </TextField>
          )
        : null}
      {policy.showSubmitter
        ? (
            <TextField
              type="email"
              isReadOnly={isReadOnly}
              fullWidth
              maxLength={254}
              value={value.submitter_email}
              onChange={next => patch('submitter_email', next)}
            >
              <Label>联系邮箱（可选）</Label>
              <Input variant="secondary" placeholder="name@example.com" spellCheck={false} />
              <Description>仅用于必要的审核沟通，不会公开。</Description>
              <FieldError />
            </TextField>
          )
        : null}
    </div>
  )
}

function PublishPanel({ isReadOnly, patch, value }: FieldGroupProps) {
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-4">
        <p className="text-sm font-black">发布设置</p>
        <p className="mt-1 text-xs leading-5 text-muted">点击主操作即可发布；需要安全检查时系统会自动处理。</p>
      </div>
      <div className="space-y-4">
        <NumberField
          variant="secondary"
          isDisabled={isReadOnly}
          maxValue={99}
          minValue={1}
          value={value.sort}
          onChange={next => patch('sort', next)}
        >
          <Label>排序权重</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <div className="space-y-3 border-t border-border pt-4">
          <Switch isDisabled={isReadOnly} isSelected={value.featured} onChange={next => patch('featured', next)}>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content>精选推荐</Switch.Content>
          </Switch>
          <Switch isDisabled={isReadOnly} isSelected={value.verified} onChange={next => patch('verified', next)}>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content>官方认证</Switch.Content>
          </Switch>
        </div>
      </div>
    </section>
  )
}

function readDraft(raw: string | null, baseUpdatedAt?: string): Partial<McpComposerValue> | null {
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw) as { baseUpdatedAt?: string | null, expiresAt?: number, value?: unknown, version?: number }
    if (parsed.version !== DRAFT_VERSION || !parsed.expiresAt || parsed.expiresAt <= Date.now() || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
      return null
    if (baseUpdatedAt && parsed.baseUpdatedAt !== baseUpdatedAt)
      return null
    return parsed.value as Partial<McpComposerValue>
  }
  catch { return null }
}

function SourceFields({ isReadOnly, patch, value }: FieldGroupProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        type="url"
        isReadOnly={isReadOnly}
        isRequired
        fullWidth
        value={value.source_url}
        onChange={next => patch('source_url', next)}
        className="sm:col-span-2"
      >
        <Label>公开源代码地址</Label>
        <Input id="mcp-field-source" variant="secondary" placeholder="https://github.com/owner/mcp-server" spellCheck={false} />
        <Description>当前评测只覆盖平台保存的 MCP 配置；不会执行或连接第三方 Server。</Description>
        <FieldError />
      </TextField>
      <TextField isReadOnly={isReadOnly} fullWidth maxLength={160} value={value.registry_name} onChange={next => patch('registry_name', next)}>
        <Label>Registry 名称（可选）</Label>
        <Input variant="secondary" placeholder="io.github.owner/server" spellCheck={false} />
      </TextField>
      <Select
        aria-label="协议版本"
        variant="secondary"
        isDisabled={isReadOnly}
        isRequired
        value={value.protocol_version}
        onChange={key => patch('protocol_version', String(key))}
      >
        <Label>MCP 协议版本</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {MCP_PROTOCOL_VERSIONS.map(version => (
              <ListBox.Item key={version} id={version}>
                {version}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <TextField type="url" isReadOnly={isReadOnly} fullWidth value={value.homepage_url} onChange={next => patch('homepage_url', next)}>
        <Label>项目主页（可选）</Label>
        <Input variant="secondary" placeholder="https://example.com" spellCheck={false} />
        <FieldError />
      </TextField>
      <TextField type="url" isReadOnly={isReadOnly} fullWidth value={value.docs_url} onChange={next => patch('docs_url', next)}>
        <Label>文档地址（可选）</Label>
        <Input variant="secondary" placeholder="https://docs.example.com" spellCheck={false} />
        <FieldError />
      </TextField>
      <TextField isReadOnly={isReadOnly} fullWidth maxLength={40} value={value.language} onChange={next => patch('language', next)}>
        <Label>开发语言（可选）</Label>
        <Input variant="secondary" placeholder="TypeScript" />
      </TextField>
      <TextField isReadOnly={isReadOnly} fullWidth maxLength={40} value={value.version} onChange={next => patch('version', next)}>
        <Label>Server 版本（可选）</Label>
        <Input variant="secondary" placeholder="1.0.0" spellCheck={false} />
      </TextField>
      <TextField isReadOnly={isReadOnly} fullWidth maxLength={50} value={value.license} onChange={next => patch('license', next)}>
        <Label>开源协议（可选）</Label>
        <Input variant="secondary" placeholder="MIT" spellCheck={false} />
      </TextField>
    </div>
  )
}

function validateComposer(value: McpComposerValue, intent: McpSubmitIntent, reviewNote: string): ComposerValidationIssue | null {
  if (intent === 'reject')
    return reviewNote.trim() ? null : validationIssue('拒绝投稿时请填写具体原因', 'mcp-field-review-note')
  if (!value.name.trim())
    return validationIssue('请填写 MCP Server 名称', 'mcp-field-name')
  if (!value.summary.trim())
    return validationIssue('请填写一句话简介', 'mcp-field-summary')
  if (!value.description.trim())
    return validationIssue('请填写完整说明', 'mcp-field-description')
  if (!value.category)
    return validationIssue('请选择 MCP 分类', 'mcp-field-category')
  if (!value.capabilities.length)
    return validationIssue('请至少选择一项能力', 'mcp-field-capabilities')
  if (!value.clients.length)
    return validationIssue('请至少选择一个兼容客户端', 'mcp-field-clients')
  if (!value.source_url.trim())
    return validationIssue('请填写公开源代码地址', 'mcp-field-source')
  if (!value.publisher_name.trim())
    return validationIssue('请填写发布者名称', 'mcp-field-publisher')
  if (!value.installations.length)
    return validationIssue('请至少添加一种安装或连接方式', 'mcp-field-installations')
  for (const [index, installation] of value.installations.entries()) {
    if (!installation.label.trim() || !installation.id.trim())
      return validationIssue(`请补全第 ${index + 1} 种连接方式的名称和配置 ID`, 'mcp-field-installations')
    if (installation.transport === 'stdio' && (!installation.package.trim() || !installation.command.trim()))
      return validationIssue(`请补全“${installation.label}”的包名称和启动命令`, 'mcp-field-installations')
    if (installation.transport === 'streamable-http' && !installation.remote_url.trim())
      return validationIssue(`请填写“${installation.label}”的远程 HTTPS 端点`, 'mcp-field-installations')
    try {
      parseConfigTemplate(installation.config_template_text)
    }
    catch (reason) {
      return validationIssue(`${installation.label}：${reason instanceof Error ? reason.message : '高级配置格式无效'}`, 'mcp-field-installations')
    }
    if (installationDraftHasUnsafeSecret(installation))
      return validationIssue(`${installation.label}：敏感配置必须使用环境变量占位符`, 'mcp-field-installations')
  }
  return null
}

function validationIssue(message: string, targetId: string): ComposerValidationIssue {
  return { message, targetId }
}

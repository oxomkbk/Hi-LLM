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
import { SKILL_CATEGORIES, SKILL_PLATFORMS } from '@/lib/skill-constants'

import SkillLivePreview from './skill-live-preview'

import type { SkillComposerMode, SkillComposerValue, SkillSubmitIntent } from './types'
import type { FormEvent } from 'react'

const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1_000

interface ComposerValidationIssue {
  message: string
  targetId: string
}

interface FieldGroupProps {
  isReadOnly: boolean
  patch: <Key extends keyof SkillComposerValue>(key: Key, value: SkillComposerValue[Key]) => void
  value: SkillComposerValue
}

interface SkillComposerProps {
  asideContent?: React.ReactNode
  backHref: string
  draftKey?: string
  draftStorage?: 'local' | 'session'
  error?: string | null
  initialValue: SkillComposerValue
  isReadOnly?: boolean
  isSubmitting?: boolean
  mode: SkillComposerMode
  onSubmit: (value: SkillComposerValue, intent: SkillSubmitIntent, reviewNote?: string) => Promise<boolean>
  primaryActionDisabled?: boolean
  primaryActionHint?: string
  primaryActionLabel?: string
  reviewNote?: string
  title: string
}

export default function SkillComposer({
  asideContent,
  backHref,
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
}: SkillComposerProps) {
  const initialSignature = JSON.stringify(initialValue)
  const stableInitialValue = useMemo<SkillComposerValue>(
    () => JSON.parse(initialSignature) as SkillComposerValue,
    [initialSignature],
  )
  const [value, setValue] = useState(stableInitialValue)
  const [reviewNote, setReviewNote] = useState(initialReviewNote)
  const [localIssue, setLocalIssue] = useState<ComposerValidationIssue | null>(null)
  const [authorExpanded, setAuthorExpanded] = useState(mode === 'submission' || mode === 'submission-review')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [draftReady, setDraftReady] = useState(!draftKey)
  const [draftStatus, setDraftStatus] = useState<'failed' | 'restored' | 'saved' | 'unsaved'>('saved')
  const currentSignature = useMemo(() => JSON.stringify(value), [value])
  const isDirty = currentSignature !== initialSignature
  const policy = composerPolicy(mode)
  const contentRequiresRescan = mode === 'submission-review' && isDirty
  const effectivePrimaryDisabled = primaryActionDisabled || contentRequiresRescan || iconUploading
  const completion = useMemo(() => getAuthoringCompletion([
    { completed: Boolean(value.name.trim()) },
    { completed: Boolean(value.summary.trim()) },
    { completed: Boolean(value.description.trim()) },
    { completed: Boolean(value.category) },
    { completed: value.platforms.length > 0 },
    { completed: Boolean(value.source_url.trim() || value.source_kind === 'platform_content') },
  ]), [value.category, value.description, value.name, value.platforms.length, value.source_kind, value.source_url, value.summary])

  const patch = useCallback(<Key extends keyof SkillComposerValue>(key: Key, next: SkillComposerValue[Key]) => {
    setValue(current => ({ ...current, [key]: next }))
    setDraftStatus('unsaved')
    setLocalIssue(null)
  }, [])

  const saveDraftNow = useCallback(() => {
    if (!draftKey || !isDirty || isReadOnly)
      return
    try {
      const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
      storage.setItem(draftKey, JSON.stringify({ expiresAt: Date.now() + DRAFT_TTL_MS, savedAt: Date.now(), value, version: DRAFT_VERSION }))
      setDraftStatus('saved')
    }
    catch {
      setDraftStatus('failed')
    }
  }, [draftKey, draftStorage, isDirty, isReadOnly, value])

  /* eslint-disable react/set-state-in-effect -- Drafts are external browser state and must be restored after hydration. */
  useEffect(() => {
    if (!draftKey)
      return
    const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
    try {
      const legacyKey = legacyDraftKey(draftKey)
      const currentDraft = storage.getItem(draftKey)
      const rawDraft = currentDraft ?? (legacyKey ? storage.getItem(legacyKey) : null)
      const restored = readDraft(rawDraft)
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
  }, [draftKey, draftStorage, stableInitialValue])
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    if (!draftKey || !draftReady || !isDirty)
      return
    const timeout = window.setTimeout(() => {
      const storage = draftStorage === 'session' ? window.sessionStorage : window.localStorage
      try {
        storage.setItem(draftKey, JSON.stringify({ expiresAt: Date.now() + DRAFT_TTL_MS, savedAt: Date.now(), value, version: DRAFT_VERSION }))
        setDraftStatus('saved')
      }
      catch {
        setDraftStatus('failed')
      }
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [draftKey, draftReady, draftStorage, isDirty, value])

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
      // A successful server write must not be reported as failed because storage is unavailable.
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

  const submit = async (intent: SkillSubmitIntent) => {
    if (isReadOnly || isSubmitting)
      return
    if (iconUploading) {
      setLocalIssue({ message: '图标正在上传，请等待完成后再保存', targetId: 'skill-field-icon' })
      requestAnimationFrame(() => focusValidationTarget('skill-field-icon'))
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
      if (validationError.targetId === 'skill-field-author')
        setAuthorExpanded(true)
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
          id="skill-field-description"
          name="description"
          documentHeader={(
            <EditorStudioDocumentHeader>
              <TextField
                name="name"
                isReadOnly={isReadOnly}
                isRequired
                fullWidth
                maxLength={100}
                value={value.name}
                onChange={next => patch('name', next)}
              >
                <Label>Skill 名称</Label>
                <Input id="skill-field-name" variant="secondary" autoComplete="off" placeholder="例如：React 性能审查" />
                <Description>使用清晰的功能名称，避免模糊表达。</Description>
                <FieldError />
              </TextField>
              <TextField
                name="summary"
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
                <TextArea id="skill-field-summary" variant="secondary" placeholder="说明它解决什么问题、适合什么场景。" rows={2} />
                <FieldError />
              </TextField>
            </EditorStudioDocumentHeader>
          )}
          label="完整说明"
          maxLength={6000}
          minRows={18}
          placeholder="介绍能力、适用场景、前置条件、操作步骤与注意事项。可直接粘贴 Markdown 或网页内容。"
          readOnly={isReadOnly}
          required
          saveState={draftStatus === 'failed' ? 'error' : draftStatus === 'saved' || draftStatus === 'restored' ? 'saved' : 'idle'}
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
            backLabel: 'Skills',
            brand: mode.startsWith('admin') ? 'Hi LLM Admin' : 'Hi LLM Editorial',
            brandHref: mode.startsWith('admin') ? '/admin' : '/',
            completion,
            documentLabel: value.name.trim() || title,
            inspector: (
              <div>
                {visibleError
                  ? (
                      <Alert status="danger">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>还有内容需要处理</Alert.Title>
                          <Alert.Description>{visibleError}</Alert.Description>
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
                          name="slug"
                          isReadOnly={isReadOnly}
                          isRequired
                          fullWidth
                          maxLength={80}
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          value={value.slug}
                          onChange={next => patch('slug', next)}
                        >
                          <Label>Slug</Label>
                          <Input variant="secondary" autoComplete="off" placeholder="react-performance-review" spellCheck={false} />
                          <FieldError>仅支持小写字母、数字与连字符</FieldError>
                        </TextField>
                      </EditorStudioSection>
                    )
                  : null}
                <EditorStudioSection title="发现与适配" description="用于目录筛选和详情页识别。">
                  <div id="skill-field-category" tabIndex={-1}>
                    <Select
                      aria-label="Skill 分类"
                      name="category"
                      variant="secondary"
                      isDisabled={isReadOnly}
                      isRequired
                      placeholder="请选择分类"
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
                          {SKILL_CATEGORIES.map(category => (
                            <ListBox.Item key={category} id={category} textValue={category}>
                              {category}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                  <CatalogIconField
                    name={value.name}
                    kind="skill"
                    readOnly={isReadOnly}
                    uploadMode={mode === 'submission' ? 'submission' : 'admin'}
                    value={value.icon}
                    onBusyChange={setIconUploading}
                    onChange={next => patch('icon', next)}
                  />
                  <div id="skill-field-platforms" tabIndex={-1}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Label isRequired>适用平台</Label>
                      <span className="text-xs text-muted">
                        已选
                        {value.platforms.length}
                        {' '}
                        项
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SKILL_PLATFORMS.map((platform) => {
                        const selected = value.platforms.includes(platform)
                        return (
                          <Button
                            key={platform}
                            aria-pressed={selected}
                            type="button"
                            size="sm"
                            variant={selected ? 'secondary' : 'outline'}
                            isDisabled={isReadOnly}
                            onPress={() => patch('platforms', selected ? value.platforms.filter(item => item !== platform) : [...value.platforms, platform])}
                          >
                            {selected ? <Check className="size-3.5" /> : null}
                            {platform}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                  <TagInputs appearance="submission" disabled={isReadOnly} value={value.tags} onChange={tags => patch('tags', tags.slice(0, 8))} />
                </EditorStudioSection>
                <EditorStudioSection title="来源与使用" description="来源决定评测覆盖范围和安装展示。"><SourceFields isReadOnly={isReadOnly} patch={patch} value={value} /></EditorStudioSection>
                <EditorStudioSection title="作者与投稿人" description="作者信息公开展示，联系邮箱只用于审核沟通。">
                  <Disclosure isExpanded={authorExpanded} onExpandedChange={setAuthorExpanded}>
                    <Disclosure.Heading>
                      <Button variant="ghost" slot="trigger" className="h-auto w-full justify-between px-0 py-2 text-left">
                        <span className="flex items-center gap-2">
                          <Person className="size-4" />
                          编辑作者信息
                        </span>
                        <Disclosure.Indicator />
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content><Disclosure.Body className="pt-3"><AuthorFields isReadOnly={isReadOnly} patch={patch} policy={policy} value={value} /></Disclosure.Body></Disclosure.Content>
                  </Disclosure>
                </EditorStudioSection>
                <EditorStudioSection title="发布与审核">
                  {policy.showPublishSettings
                    ? <PublishPanel isReadOnly={isReadOnly} patch={patch} value={value} />
                    : (
                        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                          提交后进入后台审核和安全评测。
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
                          <TextArea id="skill-field-review-note" variant="secondary" placeholder="拒绝时必须填写具体原因。" rows={4} />
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
                    {draftKey ? <Button type="button" variant="secondary" isDisabled={!isDirty || isSubmitting} onPress={saveDraftNow}>保存草稿</Button> : null}
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
            inspectorTitle: 'Skill 发布设置',
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
            <Drawer.Body className="bg-surface-secondary/35 p-4"><SkillLivePreview value={value} /></Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}

function AuthorFields({ isReadOnly, patch, policy, value }: FieldGroupProps & { policy: ReturnType<typeof composerPolicy> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        name="author_name"
        isReadOnly={isReadOnly}
        isRequired
        fullWidth
        maxLength={80}
        value={value.author_name}
        onChange={next => patch('author_name', next)}
      >
        <Label>作者名称</Label>
        <Input id="skill-field-author" variant="secondary" placeholder="作者或团队名称" />
        <FieldError />
      </TextField>
      <TextField
        name="author_url"
        type="url"
        isReadOnly={isReadOnly}
        fullWidth
        value={value.author_url}
        onChange={next => patch('author_url', next)}
      >
        <Label>作者主页（可选）</Label>
        <Input variant="secondary" placeholder="https://example.com" spellCheck={false} />
        <FieldError />
      </TextField>
      {policy.showSubmitter
        ? (
            <TextField
              name="submitter_name"
              isReadOnly={isReadOnly}
              fullWidth
              maxLength={80}
              value={value.submitter_name}
              onChange={next => patch('submitter_name', next)}
            >
              <Label>投稿人名称（可选）</Label>
              <Input variant="secondary" placeholder="默认使用作者名称" />
            </TextField>
          )
        : null}
      {policy.showSubmitter
        ? (
            <TextField
              name="submitter_email"
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

function composerPolicy(mode: SkillComposerMode) {
  return {
    primaryIntent: mode === 'submission' ? 'submit' as const : mode === 'submission-review' ? 'approve' as const : 'save' as const,
    primaryLabel: mode === 'submission' ? '提交审核' : mode === 'submission-review' ? '通过并发布' : mode === 'admin-create' ? '发布 Skill' : '保存更新',
    showPublishSettings: mode === 'admin-create' || mode === 'admin-edit',
    showSlug: mode !== 'submission',
    showSubmitter: mode === 'submission' || mode === 'submission-review',
  }
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

function readDraft(raw: string | null): Partial<SkillComposerValue> | null {
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw) as { expiresAt?: number, value?: unknown, version?: number }
    if (parsed.version !== DRAFT_VERSION || !parsed.expiresAt || parsed.expiresAt <= Date.now() || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
      return null
    return parsed.value as Partial<SkillComposerValue>
  }
  catch {
    return null
  }
}

function SourceFields({ isReadOnly, patch, value }: FieldGroupProps) {
  const kinds = [
    { description: '支持仓库文件和静态规则深度评测', label: 'Git 仓库', value: 'git_repository' as const },
    { description: '仅评测当前平台保存的内容', label: '外部页面', value: 'external_page' as const },
    { description: '无需外部链接，作为站内原创发布', label: '站内原创', value: 'platform_content' as const },
  ]
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label isRequired>内容来源</Label>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {kinds.map(kind => (
            <button
              key={kind.value}
              aria-pressed={value.source_kind === kind.value}
              type="button"
              disabled={isReadOnly}
              onClick={() => patch('source_kind', kind.value)}
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-left outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus aria-pressed:border-foreground aria-pressed:bg-surface-secondary disabled:cursor-default disabled:opacity-70"
            >
              <span className="block text-sm font-bold text-foreground">{kind.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{kind.description}</span>
            </button>
          ))}
        </div>
      </div>

      {value.source_kind !== 'platform_content'
        ? (
            <TextField
              name="source_url"
              type="url"
              isReadOnly={isReadOnly}
              isRequired
              fullWidth
              value={value.source_url}
              onChange={next => patch('source_url', next)}
              className="sm:col-span-2"
            >
              <Label>{value.source_kind === 'git_repository' ? 'GitHub / GitLab 仓库地址' : '公开来源页面'}</Label>
              <Input id="skill-field-source" variant="secondary" placeholder={value.source_kind === 'git_repository' ? 'https://github.com/owner/repository' : 'https://example.com/skill-page'} spellCheck={false} />
              <Description>{value.source_kind === 'git_repository' ? '仅支持公开仓库或 tree 子目录；blob、issue 页面不属于仓库来源。' : '不会抓取外部网页正文，评测只覆盖平台保存的内容。'}</Description>
              <FieldError />
            </TextField>
          )
        : (
            <div className="sm:col-span-2 rounded-xl border border-border bg-surface-secondary/45 px-4 py-3 text-xs leading-5 text-muted">
              站内原创不填写来源链接。页面会明确标注“站内原创”，安全评测只覆盖当前说明、安装方式和配置。
            </div>
          )}

      <TextField
        name="homepage_url"
        type="url"
        isReadOnly={isReadOnly}
        fullWidth
        value={value.homepage_url}
        onChange={next => patch('homepage_url', next)}
      >
        <Label>项目主页（可选）</Label>
        <Input variant="secondary" placeholder="https://example.com" spellCheck={false} />
        <FieldError />
      </TextField>

      <TextField
        name="version"
        isReadOnly={isReadOnly}
        fullWidth
        maxLength={32}
        value={value.version}
        onChange={next => patch('version', next)}
      >
        <Label>版本（可选）</Label>
        <Input variant="secondary" placeholder="1.0.0" spellCheck={false} />
      </TextField>

      <TextField
        name="license"
        isReadOnly={isReadOnly}
        fullWidth
        maxLength={50}
        value={value.license}
        onChange={next => patch('license', next)}
      >
        <Label>许可证（可选）</Label>
        <Input variant="secondary" placeholder="MIT" spellCheck={false} />
      </TextField>

      <TextField
        name="install_command"
        isReadOnly={isReadOnly}
        fullWidth
        maxLength={500}
        value={value.install_command}
        onChange={next => patch('install_command', next)}
        className="sm:col-span-2"
      >
        <Label>安装或调用方式（可选）</Label>
        <TextArea variant="secondary" placeholder="npx skills add owner/repository" rows={3} spellCheck={false} className="font-mono text-xs" />
      </TextField>
    </div>
  )
}

function validateComposer(value: SkillComposerValue, intent: SkillSubmitIntent, reviewNote: string): ComposerValidationIssue | null {
  if (intent === 'reject')
    return reviewNote.trim() ? null : validationIssue('拒绝投稿时请填写具体原因', 'skill-field-review-note')
  if (!value.name.trim())
    return validationIssue('请填写 Skill 名称', 'skill-field-name')
  if (!value.summary.trim())
    return validationIssue('请填写一句话简介', 'skill-field-summary')
  if (!value.description.trim())
    return validationIssue('请填写完整说明', 'skill-field-description')
  if (!value.category)
    return validationIssue('请选择 Skill 分类', 'skill-field-category')
  if (!value.platforms.length)
    return validationIssue('请至少选择一个适用平台', 'skill-field-platforms')
  if (!value.author_name.trim())
    return validationIssue('请填写作者名称', 'skill-field-author')
  if (value.source_kind !== 'platform_content' && !value.source_url.trim()) {
    return validationIssue(
      value.source_kind === 'git_repository' ? '请填写 GitHub 或 GitLab 仓库地址' : '请填写公开来源页面',
      'skill-field-source',
    )
  }
  return null
}

function validationIssue(message: string, targetId: string): ComposerValidationIssue {
  return { message, targetId }
}

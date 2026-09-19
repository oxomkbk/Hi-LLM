'use client'

import {
  Check,
  Envelope,
  FloppyDisk,
  Globe,
  Lock,
  ShieldCheck,
  Sparkles,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Label,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  toast,
} from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'

import LanguageFlag from '@/components/LanguageFlag'
import { broadcastAccessSettingsUpdated } from '@/lib/access-settings/client-sync'
import { ApiRequestError, request } from '@/lib/request'
import {
  isTranslationLanguageCode,
  SOURCE_TRANSLATION_LANGUAGE,
  TRANSLATION_LANGUAGES,
} from '@/lib/translation/languages'

import { AdminPageHeader } from './admin-ui'

import type {
  ContentDetailOpenMode,
  SiteAccessSettings,
  SubmissionAccessMode,
  WonderlandComposerMode,
} from '@/lib/access-settings/types'
import type { TranslationLanguageCode } from '@/lib/translation/languages'

export default function AccessSettingsConsole() {
  const [settings, setSettings] = useState<SiteAccessSettings | null>(null)
  const [draft, setDraft] = useState<SiteAccessSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await request<SiteAccessSettings>('/admin/access-settings')
      setSettings(result.data)
      setDraft(result.data)
    }
    catch {
      setSettings(null)
      setDraft(null)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const changed = Boolean(settings && draft && accessSettingsChanged(settings, draft))

  useEffect(() => {
    if (!changed)
      return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [changed])

  const save = async () => {
    if (!draft)
      return
    setSaving(true)
    try {
      const result = await request<SiteAccessSettings>('/admin/access-settings', {
        body: JSON.stringify({
          contentDetailOpenMode: draft.contentDetailOpenMode,
          expectedVersion: draft.configVersion,
          emailAccessMode: draft.emailAccessMode,
          emailAllowlist: draft.emailAllowlist,
          mcpSubmissionMode: draft.mcpSubmissionMode,
          mcpSubmissionEnabled: draft.mcpSubmissionEnabled,
          mcpSubmissionVisible: draft.mcpSubmissionVisible,
          promptSubmissionEnabled: draft.promptSubmissionEnabled,
          promptSubmissionVisible: draft.promptSubmissionVisible,
          registrationEnabled: draft.registrationEnabled,
          skillSubmissionMode: draft.skillSubmissionMode,
          skillSubmissionEnabled: draft.skillSubmissionEnabled,
          skillSubmissionVisible: draft.skillSubmissionVisible,
          translationDefaultLanguage: draft.translationDefaultLanguage,
          translationEnabled: draft.translationEnabled,
          translationLanguages: draft.translationLanguages,
          websiteSubmissionMode: draft.websiteSubmissionMode,
          websiteSubmissionEnabled: draft.websiteSubmissionEnabled,
          websiteSubmissionVisible: draft.websiteSubmissionVisible,
          wonderlandSubmissionEnabled: draft.wonderlandSubmissionEnabled,
          wonderlandSubmissionVisible: draft.wonderlandSubmissionVisible,
          wonderlandComposerMode: draft.wonderlandComposerMode,
          workSubmissionEnabled: draft.workSubmissionEnabled,
          workSubmissionVisible: draft.workSubmissionVisible,
        }),
        method: 'PUT',
      })
      setSettings(result.data)
      setDraft(result.data)
      broadcastAccessSettingsUpdated(result.data.configVersion)
      toast.success('设置已保存，已同步到打开的前台页面')
    }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'ACCESS_SETTINGS_STALE')
        toast.warning('设置已被其他管理员修改，请刷新后重新确认')
      await load()
    }
    finally {
      setSaving(false)
    }
  }

  if (loading && !draft) {
    return <div className="grid min-h-72 place-items-center"><Spinner size="lg" /></div>
  }

  if (!draft || !settings) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>访问策略暂不可用</Alert.Title>
          <Alert.Description>系统已自动采用关闭注册、投稿需登录的安全模式。</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={() => void load()}>重试</Button>
      </Alert>
    )
  }

  return (
    <div className="admin-settings-page mx-auto w-full max-w-5xl space-y-5 pb-10">
      <AdminPageHeader
        title="访问与发布"
        actions={(
          <div className="flex items-center gap-3">
            <span data-dirty={changed ? 'true' : 'false'} className="admin-unsaved-state">{changed ? '有未保存的更改' : '已保存'}</span>
            <Button
              isDisabled={!changed || saving}
              isPending={saving}
              onPress={() => void save()}
              className="sm:min-w-32"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <FloppyDisk />}
                  保存设置
                </>
              )}
            </Button>
          </div>
        )}
        description="集中管理登录范围、详情打开方式、页面翻译和社区投稿权限。"
      />

      <nav aria-label="访问设置目录" className="admin-settings-index">
        <a href="#access-browsing">浏览方式</a>
        <a href="#access-translation">页面翻译</a>
        <a href="#access-email">邮箱范围</a>
        <a href="#access-registration">账号注册</a>
        <a href="#access-submissions">社区投稿</a>
        <a href="#access-wonderland">妙妙屋</a>
      </nav>

      <Card id="access-browsing" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>内容浏览方式</Card.Title>
              <Card.Description>统一控制 Skills、MCP、Prompts、妙妙屋问题、资讯与社区作品的详情打开方式。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="px-0 pt-5">
          <RadioGroup
            aria-label="内容详情打开方式"
            value={draft.contentDetailOpenMode}
            onChange={contentDetailOpenMode => setDraft(current => current ? { ...current, contentDetailOpenMode: contentDetailOpenMode as ContentDetailOpenMode } : current)}
            className="gap-3 md:grid md:grid-cols-2"
          >
            <ModeRadio title="当前标签页打开" description="保留现有体验；返回目录时恢复筛选、页码和阅读位置。" value="same_tab" />
            <ModeRadio title="新标签页打开" description="目录保持原位，详情在独立标签页中打开。" value="new_tab" />
          </RadioGroup>
        </Card.Content>
      </Card>

      <Card id="access-translation" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <Globe className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>页面翻译</Card.Title>
              <Card.Description>控制前台语言入口、可选择的语言和访客首次打开时的默认语言。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="space-y-5 px-0 pt-5">
          <Switch
            isSelected={draft.translationEnabled}
            onChange={translationEnabled => setDraft(current => current
              ? enableTranslation(current, translationEnabled)
              : current)}
          >
            <Switch.Content className="w-full items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium">在前台显示翻译入口</p>
                <p className="mt-1 text-xs leading-5 text-muted">关闭后立即隐藏入口并恢复简体中文；开启时仅在访客选择非中文后加载翻译运行时。</p>
              </div>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>

          <div className={`grid gap-5 border-t border-border pt-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(14rem,0.6fr)] ${draft.translationEnabled ? '' : 'opacity-50'}`}>
            <fieldset disabled={!draft.translationEnabled} className="min-w-0">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <legend className="text-sm font-medium">前台可选语言</legend>
                  <p className="mt-1 text-xs leading-5 text-muted">简体中文是页面源语言，固定保留；至少选择一种目标语言。</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {draft.translationLanguages.length}
                  {' '}
                  种
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {TRANSLATION_LANGUAGES.map((language) => {
                  const selected = draft.translationLanguages.includes(language.code)
                  const locked = language.code === SOURCE_TRANSLATION_LANGUAGE
                    || (selected && language.code === draft.translationDefaultLanguage)
                    || (selected && draft.translationLanguages.length <= 2)
                  return (
                    <button
                      key={language.code}
                      aria-pressed={selected}
                      type="button"
                      disabled={!draft.translationEnabled || locked}
                      onClick={() => setDraft(current => current ? toggleTranslationLanguage(current, language.code) : current)}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-focus/30 ${selected ? 'bg-accent-soft text-accent-soft-foreground' : 'bg-surface-secondary text-muted hover:text-foreground'} disabled:cursor-not-allowed`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <LanguageFlag countryCode={language.countryCode} className="w-6" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{language.nativeLabel}</span>
                          {language.nativeLabel !== language.label ? <span className="mt-0.5 block text-[10px] opacity-70">{language.label}</span> : null}
                        </span>
                      </span>
                      <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${selected ? 'bg-accent text-accent-foreground' : 'bg-surface'}`}>
                        {selected ? '✓' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="rounded-xl bg-surface-secondary/70 p-4">
              <label htmlFor="translation-default-language" className="text-sm font-medium">默认显示语言</label>
              <select
                id="translation-default-language"
                disabled={!draft.translationEnabled}
                value={draft.translationDefaultLanguage}
                onChange={(event) => {
                  const translationDefaultLanguage = event.target.value
                  if (isTranslationLanguageCode(translationDefaultLanguage))
                    setDraft(current => current ? { ...current, translationDefaultLanguage } : current)
                }}
                className="mt-2 h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-medium outline-none focus:border-focus focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed"
              >
                {draft.translationLanguages.map((code) => {
                  const language = TRANSLATION_LANGUAGES.find(item => item.code === code)
                  return language ? <option key={code} value={code}>{language.label}</option> : null
                })}
              </select>
              <p className="mt-3 text-xs leading-5 text-muted">默认保持简体中文可避免首屏翻译等待；访客自己的选择会保存在浏览器中。</p>
              <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-muted">切换到非中文时，页面可见文本会发送给 translate.js 公共翻译服务，请勿在前台渲染敏感信息。</p>
            </div>
          </div>
        </Card.Content>
      </Card>

      <Card id="access-email" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <Envelope className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>邮箱访问范围</Card.Title>
              <Card.Description>控制哪些邮箱可以创建新会话；支持具体邮箱和企业域名。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="space-y-5 px-0 pt-5">
          <Switch
            isSelected={draft.emailAccessMode === 'allowlist'}
            onChange={enabled => setDraft(current => current ? { ...current, emailAccessMode: enabled ? 'allowlist' : 'open' } : current)}
          >
            <Switch.Content className="w-full items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium">启用邮箱白名单</p>
                <p className="mt-1 text-xs leading-5 text-muted">开启后，仅白名单中的邮箱或域名可以注册和重新登录。</p>
              </div>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>

          {draft.emailAccessMode === 'allowlist'
            ? (
                <div className="grid gap-4 border-t border-border pt-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(15rem,0.65fr)]">
                  <label htmlFor="email-allowlist" className="min-w-0">
                    <span className="text-sm font-medium">允许访问的邮箱</span>
                    <textarea
                      aria-describedby="email-allowlist-help"
                      id="email-allowlist"
                      name="emailAllowlist"
                      autoComplete="off"
                      placeholder={'admin@example.com\n@example.com'}
                      rows={7}
                      spellCheck={false}
                      value={draft.emailAllowlist.join('\n')}
                      onChange={event => setDraft(current => current ? { ...current, emailAllowlist: parseAllowlistDraft(event.target.value) } : current)}
                      className="mt-2 w-full resize-y rounded-xl border border-border bg-surface-secondary px-3 py-2.5 font-mono text-xs leading-6 outline-none transition-[border-color,box-shadow] focus:border-focus focus:ring-2 focus:ring-focus/20"
                    />
                    <span id="email-allowlist-help" className="mt-1.5 block text-xs leading-5 text-muted">
                      每行一条。填写完整邮箱，或使用
                      <code>@example.com</code>
                      {' '}
                      允许整个域名。
                    </span>
                  </label>
                  <aside className="rounded-xl bg-surface-secondary/70 px-4 py-3.5">
                    <p className="text-xs font-semibold text-foreground">保存前检查</p>
                    <ul className="mt-2 space-y-2 text-xs leading-5 text-muted">
                      <li>当前管理员必须包含在规则中</li>
                      <li>规则只影响新登录，不会踢出在线用户</li>
                      <li>最多保存 200 条邮箱或域名</li>
                    </ul>
                    <p className="mt-3 border-t border-border pt-3 font-mono text-xs text-accent">
                      {draft.emailAllowlist.filter(Boolean).length}
                      {' '}
                      条规则
                    </p>
                  </aside>
                </div>
              )
            : null}
        </Card.Content>
      </Card>

      <Card id="access-registration" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>账号注册</Card.Title>
              <Card.Description>控制前台新账号创建；已有账号能否登录仍由上方邮箱访问范围决定。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="px-0 pt-5">
          <Switch
            isSelected={draft.registrationEnabled}
            onChange={registrationEnabled => setDraft(current => current ? { ...current, registrationEnabled } : current)}
          >
            <Switch.Content className="w-full items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium">开放注册入口</p>
                <p className="mt-1 text-xs leading-5 text-muted">关闭后隐藏注册入口并阻止新账号创建，不影响已有账号。</p>
              </div>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>
        </Card.Content>
      </Card>

      <Card id="access-submissions" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>社区投稿</Card.Title>
              <Card.Description>每个投稿入口都可以独立控制显示与发布能力；关闭发布会保留浏览体验，审核流程保持不变。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="divide-y divide-border px-0 py-0">
          <SubmissionControlRow
            description="导航页的“提交网站”弹窗"
            enabled={draft.websiteSubmissionEnabled}
            label="网站投稿"
            mode={draft.websiteSubmissionMode}
            visible={draft.websiteSubmissionVisible}
            onEnabledChange={websiteSubmissionEnabled => setDraft(current => current ? { ...current, websiteSubmissionEnabled } : current)}
            onModeChange={websiteSubmissionMode => setDraft(current => current ? { ...current, websiteSubmissionMode } : current)}
            onVisibleChange={websiteSubmissionVisible => setDraft(current => current ? { ...current, websiteSubmissionVisible } : current)}
          />
          <SubmissionControlRow
            description="Skills 社区投稿页面"
            enabled={draft.skillSubmissionEnabled}
            label="Skills 投稿"
            mode={draft.skillSubmissionMode}
            visible={draft.skillSubmissionVisible}
            onEnabledChange={skillSubmissionEnabled => setDraft(current => current ? { ...current, skillSubmissionEnabled } : current)}
            onModeChange={skillSubmissionMode => setDraft(current => current ? { ...current, skillSubmissionMode } : current)}
            onVisibleChange={skillSubmissionVisible => setDraft(current => current ? { ...current, skillSubmissionVisible } : current)}
          />
          <SubmissionControlRow
            description="MCP Server 社区投稿页面"
            enabled={draft.mcpSubmissionEnabled}
            label="MCP 投稿"
            mode={draft.mcpSubmissionMode}
            visible={draft.mcpSubmissionVisible}
            onEnabledChange={mcpSubmissionEnabled => setDraft(current => current ? { ...current, mcpSubmissionEnabled } : current)}
            onModeChange={mcpSubmissionMode => setDraft(current => current ? { ...current, mcpSubmissionMode } : current)}
            onVisibleChange={mcpSubmissionVisible => setDraft(current => current ? { ...current, mcpSubmissionVisible } : current)}
          />
          <SubmissionControlRow
            description="Prompts 社区投稿页面"
            enabled={draft.promptSubmissionEnabled}
            label="Prompt 投稿"
            visible={draft.promptSubmissionVisible}
            onEnabledChange={promptSubmissionEnabled => setDraft(current => current ? { ...current, promptSubmissionEnabled } : current)}
            onVisibleChange={promptSubmissionVisible => setDraft(current => current ? { ...current, promptSubmissionVisible } : current)}
          />
          <SubmissionControlRow
            description="妙妙屋的问题、回答和评论发布"
            enabled={draft.wonderlandSubmissionEnabled}
            label="妙妙屋内容"
            visible={draft.wonderlandSubmissionVisible}
            onEnabledChange={wonderlandSubmissionEnabled => setDraft(current => current ? { ...current, wonderlandSubmissionEnabled } : current)}
            onVisibleChange={wonderlandSubmissionVisible => setDraft(current => current ? { ...current, wonderlandSubmissionVisible } : current)}
          />
          <SubmissionControlRow
            description="妙妙屋作品广场的作品发布"
            enabled={draft.workSubmissionEnabled}
            label="作品投稿"
            visible={draft.workSubmissionVisible}
            onEnabledChange={workSubmissionEnabled => setDraft(current => current ? { ...current, workSubmissionEnabled } : current)}
            onVisibleChange={workSubmissionVisible => setDraft(current => current ? { ...current, workSubmissionVisible } : current)}
          />
        </Card.Content>
      </Card>

      <Card id="access-wonderland" className="admin-flat-panel admin-settings-section overflow-hidden">
        <Card.Header className="border-b border-border px-0 pb-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 text-accent" />
            <div>
              <Card.Title>妙妙屋发布体验</Card.Title>
              <Card.Description>问题、回答和评论最终发布始终需要登录，访客图片也不会提前上传。</Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content className="px-0 pt-5">
          <RadioGroup
            aria-label="妙妙屋发布体验"
            value={draft.wonderlandComposerMode}
            onChange={wonderlandComposerMode => setDraft(current => current ? { ...current, wonderlandComposerMode: wonderlandComposerMode as WonderlandComposerMode } : current)}
            className="gap-3"
          >
            <ModeRadio title="登录后显示编辑器" description="访客先登录，再进入提问、回答或评论编辑器。" value="authenticated" />
            <ModeRadio title="访客可先编辑文字" description="提交时登录并恢复文字草稿；选择、拖放或粘贴图片前仍需登录。" value="guest_preview" />
          </RadioGroup>
        </Card.Content>
      </Card>

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          策略版本
          {settings.configVersion}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3.5" />
          权限判断在服务端强制执行
        </span>
      </div>
    </div>
  )
}

function accessSettingsChanged(left: SiteAccessSettings, right: SiteAccessSettings) {
  return left.contentDetailOpenMode !== right.contentDetailOpenMode
    || left.registrationEnabled !== right.registrationEnabled
    || left.emailAccessMode !== right.emailAccessMode
    || left.emailAllowlist.join('\n') !== right.emailAllowlist.join('\n')
    || left.websiteSubmissionMode !== right.websiteSubmissionMode
    || left.websiteSubmissionEnabled !== right.websiteSubmissionEnabled
    || left.websiteSubmissionVisible !== right.websiteSubmissionVisible
    || left.skillSubmissionMode !== right.skillSubmissionMode
    || left.skillSubmissionEnabled !== right.skillSubmissionEnabled
    || left.skillSubmissionVisible !== right.skillSubmissionVisible
    || left.translationDefaultLanguage !== right.translationDefaultLanguage
    || left.translationEnabled !== right.translationEnabled
    || left.translationLanguages.join('\n') !== right.translationLanguages.join('\n')
    || left.mcpSubmissionMode !== right.mcpSubmissionMode
    || left.mcpSubmissionEnabled !== right.mcpSubmissionEnabled
    || left.mcpSubmissionVisible !== right.mcpSubmissionVisible
    || left.promptSubmissionEnabled !== right.promptSubmissionEnabled
    || left.promptSubmissionVisible !== right.promptSubmissionVisible
    || left.wonderlandSubmissionEnabled !== right.wonderlandSubmissionEnabled
    || left.wonderlandSubmissionVisible !== right.wonderlandSubmissionVisible
    || left.wonderlandComposerMode !== right.wonderlandComposerMode
    || left.workSubmissionEnabled !== right.workSubmissionEnabled
    || left.workSubmissionVisible !== right.workSubmissionVisible
}

function enableTranslation(settings: SiteAccessSettings, translationEnabled: boolean): SiteAccessSettings {
  if (!translationEnabled)
    return { ...settings, translationEnabled: false }
  if (settings.translationLanguages.length > 1)
    return { ...settings, translationEnabled: true }
  return {
    ...settings,
    translationEnabled: true,
    translationLanguages: [SOURCE_TRANSLATION_LANGUAGE, 'english'],
  }
}

function ModeRadio({ compact = false, description, title, value }: {
  compact?: boolean
  description: string
  title: string
  value: string
}) {
  return (
    <Radio value={value} className={`rounded-xl bg-surface-secondary/60 px-3 py-3 ${compact ? 'min-w-40 flex-1' : 'w-full'}`}>
      <Radio.Content className="items-start gap-3">
        <Radio.Control className="mt-0.5"><Radio.Indicator /></Radio.Control>
        <span>
          <Label className="text-sm font-medium">{title}</Label>
          <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
        </span>
      </Radio.Content>
    </Radio>
  )
}

function parseAllowlistDraft(value: string) {
  return value.split(/[\n,;]+/).map(entry => entry.trim()).filter(Boolean)
}

function SubmissionControlRow({ description, enabled, label, mode, onEnabledChange, onModeChange, onVisibleChange, visible }: {
  description: string
  enabled: boolean
  label: string
  mode?: SubmissionAccessMode
  onEnabledChange: (value: boolean) => void
  onModeChange?: (value: SubmissionAccessMode) => void
  onVisibleChange: (value: boolean) => void
  visible: boolean
}) {
  return (
    <div className="grid gap-4 py-5 first:pt-5 last:pb-5 md:grid-cols-[minmax(13rem,0.72fr)_minmax(20rem,1.28fr)] md:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${enabled ? 'bg-success-soft text-success-soft-foreground' : 'bg-surface-secondary text-muted'}`}>
            {enabled ? '可发布' : '已关闭'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Switch isSelected={visible} onChange={onVisibleChange}>
            <Switch.Content className="w-full items-center justify-between gap-3 rounded-xl bg-surface-secondary/60 px-3 py-2.5">
              <span>
                <span className="block text-xs font-semibold">显示前台入口</span>
                <span className="mt-0.5 block text-[11px] text-muted">关闭后用户看不到投稿按钮</span>
              </span>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>
          <Switch isSelected={enabled} onChange={onEnabledChange}>
            <Switch.Content className="w-full items-center justify-between gap-3 rounded-xl bg-surface-secondary/60 px-3 py-2.5">
              <span>
                <span className="block text-xs font-semibold">开启投稿功能</span>
                <span className="mt-0.5 block text-[11px] text-muted">关闭后入口显示为暂未开放</span>
              </span>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        {mode && onModeChange
          ? (
              <RadioGroup
                aria-label={`${label}访问模式`}
                orientation="horizontal"
                value={mode}
                onChange={next => onModeChange(next as SubmissionAccessMode)}
                className="gap-3"
              >
                <ModeRadio title="允许游客投稿" compact description="登录不是必需条件" value="anonymous" />
                <ModeRadio title="仅登录用户" compact description="未登录先跳转登录" value="authenticated" />
              </RadioGroup>
            )
          : null}
      </div>
    </div>
  )
}

function toggleTranslationLanguage(settings: SiteAccessSettings, code: TranslationLanguageCode): SiteAccessSettings {
  const selected = settings.translationLanguages.includes(code)
  if (selected) {
    if (code === SOURCE_TRANSLATION_LANGUAGE || code === settings.translationDefaultLanguage || settings.translationLanguages.length <= 2)
      return settings
    return { ...settings, translationLanguages: settings.translationLanguages.filter(item => item !== code) }
  }

  const nextCodes = new Set([...settings.translationLanguages, code])
  return {
    ...settings,
    translationLanguages: TRANSLATION_LANGUAGES.map(language => language.code).filter(language => nextCodes.has(language)),
  }
}

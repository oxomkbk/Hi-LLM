'use client'

import {
  ArrowRight,
  Check,
  CircleCheckFill,
  Globe,
  MagicWand,
  PaperPlane,
  ShieldCheck,
  TriangleExclamation,
  Xmark,
} from '@gravity-ui/icons'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Switch,
  TextArea,
  TextField,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import LogoUpload from '@/app/admin/components/websites/components/logo-upload'
import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import CategoryMultiSelect from '@/components/ui/category-multi-select'
import { useAuthUser } from '@/hooks/use-auth-user'
import useRequest from '@/hooks/use-request'
import { getSubmissionAvailability } from '@/lib/access-settings/submission-controls'
import { clearSubmissionDraft, loadSubmissionDraft, saveSubmissionDraft } from '@/lib/access-settings/submission-drafts'
import { createLoginUrl } from '@/lib/auth/callback-url'
import { ApiRequestError, request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'
import { extractionIconToFile } from '@/lib/website-extraction-client'

import type { FileWithPreview } from '@/hooks/use-file-upload'
import type { WebsiteExtractionResult } from '@/types'
import type { FormEvent } from 'react'

interface PublicCategory {
  id: string
  name: string
}

export default function WebsiteSubmissionDialog() {
  const state = useOverlayState()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [extractedLogoPreview, setExtractedLogoPreview] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [draft, setDraft] = useState({ desc: '', name: '', url: '' })
  const [vpn, setVpn] = useState(false)
  const [formVersion, setFormVersion] = useState(0)
  const [submissionErrors, setSubmissionErrors] = useState<{ category?: string, logo?: string }>({})
  const intentHandledRef = useRef(false)
  const { loading: accessLoading, settings } = useAccessSettings()
  const { loading: authLoading, user } = useAuthUser()
  const availability = getSubmissionAvailability(settings, 'website')

  const { data: categoryData, loading: categoryLoading } = useRequest<PublicCategory[]>('/public/categories')
  const categories = useMemo(() => categoryData ?? [], [categoryData])

  const resetForm = useCallback(() => {
    setLogoFile(null)
    setExtractedLogoPreview(null)
    setDraft({ desc: '', name: '', url: '' })
    setCategoryIds([])
    setVpn(false)
    setSubmissionErrors({})
    clearSubmissionDraft('website')
    setFormVersion(version => version + 1)
  }, [])

  useEffect(() => {
    if (intentHandledRef.current || authLoading || !user || availability !== 'enabled' || typeof window === 'undefined')
      return
    const query = new URLSearchParams(window.location.search)
    if (query.get('intent') !== 'submit-website')
      return
    const restored = loadSubmissionDraft('website')
    const frame = window.requestAnimationFrame(() => {
      if (intentHandledRef.current)
        return
      intentHandledRef.current = true
      if (restored) {
        setDraft({
          desc: typeof restored.desc === 'string' ? restored.desc : '',
          name: typeof restored.name === 'string' ? restored.name : '',
          url: typeof restored.url === 'string' ? restored.url : '',
        })
        setCategoryIds(Array.isArray(restored.categoryIds) ? restored.categoryIds.filter((item): item is string => typeof item === 'string') : [])
        setVpn(restored.vpn === true)
        toast.warning('文字草稿已恢复，请重新选择网站 Logo')
      }
      window.history.replaceState(window.history.state, '', '/')
      state.open()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [authLoading, availability, state, user])

  const handleLogoChange = useCallback((value: FileWithPreview | null) => {
    setLogoFile(value?.file instanceof File ? value.file : null)
    if (value?.file instanceof File)
      setSubmissionErrors(current => ({ ...current, logo: undefined }))
  }, [])

  const { loading, run } = useRequest('/submissions', {
    method: 'POST',
    manual: true,
    onSuccess: ({ code, msg }) => {
      if (code === RESPONSE.SUCCESS) {
        toast.success(msg, {
          timeout: 3500,
          indicator: <CircleCheckFill />,
        })
        state.close()
        resetForm()
      }
    },
  })

  const extractWebsite = async () => {
    try {
      const parsed = new URL(draft.url)
      if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.'))
        throw new Error('网站地址无效')
    }
    catch {
      toast.danger('请输入以 https:// 开头的公开网站地址')
      return
    }

    setExtracting(true)
    try {
      const result = await request<WebsiteExtractionResult>('/website-extract', {
        body: JSON.stringify({ url: draft.url }),
        method: 'POST',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return
      setDraft(current => ({
        desc: result.data.description || result.data.sourceDescription || current.desc,
        name: result.data.name || current.name,
        url: result.data.url || current.url,
      }))
      if (result.data.icon) {
        const file = extractionIconToFile(result.data.icon)
        setExtractedLogoPreview(result.data.icon.dataUrl)
        setLogoFile(file)
      }
      if (result.data.warnings.length)
        toast.warning(result.data.warnings[0])
      else
        toast.success('名称、描述和图标已提取')
    }
    catch {
      // request 已统一展示服务端错误。
    }
    finally {
      setExtracting(false)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!logoFile) {
      setSubmissionErrors(current => ({ ...current, logo: '请上传网站 Logo' }))
      focusSubmissionTarget('website-field-logo')
      return
    }
    if (!categoryIds.length) {
      setSubmissionErrors(current => ({ ...current, category: '请至少选择一个分类' }))
      focusSubmissionTarget('website-field-categories')
      return
    }

    const formData = new FormData(event.currentTarget)
    categoryIds.forEach(categoryId => formData.append('category_ids', categoryId))
    formData.set('vpn', vpn ? 'true' : 'false')
    formData.set('logo', logoFile)
    try {
      await run(formData)
    }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED') {
        saveSubmissionDraft('website', { ...draft, categoryIds, vpn })
        toast.warning('登录后会恢复文字内容，网站 Logo 需要重新选择')
        window.location.assign(createLoginUrl('/?intent=submit-website'))
      }
    }
  }

  const open = () => {
    if (availability !== 'enabled') {
      toast.warning('网站投稿暂未开放')
      return
    }
    if (settings.websiteSubmissionMode === 'authenticated' && !user) {
      window.location.assign(createLoginUrl('/?intent=submit-website'))
      return
    }
    state.open()
  }

  return (
    <>
      <span title={availability === 'disabled' ? '网站投稿暂未开放' : undefined}>
        <Button
          aria-label="提交网站"
          size="sm"
          variant="primary"
          isDisabled={accessLoading || authLoading || availability !== 'enabled'}
          onPress={open}
          className="website-submission-trigger"
        >
          <PaperPlane aria-hidden="true" className="size-4 shrink-0" />
          <span>
            提交
            <span className="hidden sm:inline">网站</span>
          </span>
        </Button>
      </span>

      <Modal.Backdrop
        variant="blur"
        isDismissable={false}
        isKeyboardDismissDisabled={loading}
        isOpen={state.isOpen}
        onOpenChange={state.setOpen}
      >
        <Modal.Container placement="auto" scroll="inside">
          <Modal.Dialog className="overflow-hidden sm:max-w-[760px]">
            <Button
              aria-label="关闭提交网站弹窗"
              size="sm"
              variant="ghost"
              isDisabled={loading}
              isIconOnly
              onPress={state.close}
              className="modal__close-trigger z-10"
            >
              <Xmark className="size-4" />
            </Button>

            <Modal.Header className="flex flex-row items-center gap-3 px-5 py-4 sm:px-6 sm:py-5">
              <Modal.Icon className="size-10 shrink-0 rounded-xl bg-accent-soft text-accent-soft-foreground">
                <Globe className="size-5" />
              </Modal.Icon>
              <div className="min-w-0 pr-8">
                <Modal.Heading className="text-lg font-black tracking-[-0.025em] sm:text-xl">提交网站</Modal.Heading>
                <p className="mt-0.5 text-xs text-muted">填写网站公开资料，审核通过后展示在导航首页</p>
              </div>
              <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold text-success-soft-foreground md:inline-flex">
                <ShieldCheck className="size-3.5" />
                安全审核
              </span>
            </Modal.Header>

            <Modal.Body className="px-5 py-4 sm:px-6 sm:py-5">
              <Form
                key={formVersion}
                aria-label="提交网站"
                id="website-submission-form"
                validationBehavior="aria"
                onSubmit={onSubmit}
                className="flex flex-col gap-4"
              >
                <input aria-hidden="true" name="company" autoComplete="off" tabIndex={-1} className="hidden" />

                <div className="flex items-end gap-2">
                  <TextField
                    name="url"
                    isRequired
                    validate={(value) => {
                      try {
                        const url = new URL(value)
                        if (url.protocol !== 'https:' || !url.hostname.includes('.'))
                          return '请输入以 https:// 开头的公开网站地址'
                      }
                      catch {
                        return '请输入以 https:// 开头的公开网站地址'
                      }
                      return null
                    }}
                    value={draft.url}
                    onChange={url => setDraft(current => ({ ...current, url }))}
                    className="min-w-0 flex-1"
                  >
                    <Label>网站链接</Label>
                    <Input type="url" variant="secondary" fullWidth placeholder="https://example.com" />
                    <FieldError />
                  </TextField>
                  <Button
                    type="button"
                    variant="secondary"
                    isDisabled={loading}
                    isPending={extracting}
                    onPress={() => void extractWebsite()}
                    className="shrink-0"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner color="current" size="sm" /> : <MagicWand />}
                        <span className="hidden sm:inline">一键提取</span>
                        <span className="sm:hidden">提取</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    name="name"
                    isRequired
                    maxLength={100}
                    value={draft.name}
                    onChange={name => setDraft(current => ({ ...current, name }))}
                    className="w-full"
                  >
                    <Label>网站名称</Label>
                    <Input variant="secondary" fullWidth placeholder="例如：HiLLM Nav" />
                    <FieldError />
                  </TextField>

                  <div id="website-field-categories" tabIndex={-1} className="w-full">
                    <CategoryMultiSelect
                      categories={categories}
                      disabled={loading}
                      loading={categoryLoading}
                      value={categoryIds}
                      onChange={(next) => {
                        setCategoryIds(next)
                        if (next.length)
                          setSubmissionErrors(current => ({ ...current, category: undefined }))
                      }}
                      className="w-full"
                    />
                    {submissionErrors.category
                      ? <p role="alert" className="mt-1 px-1 text-xs font-medium text-danger">{submissionErrors.category}</p>
                      : null}
                  </div>

                  <TextField
                    name="desc"
                    maxLength={500}
                    value={draft.desc}
                    onChange={desc => setDraft(current => ({ ...current, desc }))}
                    className="w-full sm:col-span-2"
                  >
                    <Label>网站描述</Label>
                    <TextArea variant="secondary" fullWidth placeholder="一句话说明这个网站的用途" rows={2} />
                  </TextField>
                </div>

                <div id="website-field-logo" data-invalid={Boolean(submissionErrors.logo)} tabIndex={-1} className="rounded-xl data-[invalid=true]:ring-2 data-[invalid=true]:ring-danger/25">
                  <LogoUpload
                    appearance="submission"
                    externalPreview={extractedLogoPreview}
                    maxSize={1024 * 1024}
                    onExternalClear={() => {
                      setExtractedLogoPreview(null)
                      setLogoFile(null)
                    }}
                    onFileChange={(value) => {
                      handleLogoChange(value)
                      if (value)
                        setExtractedLogoPreview(null)
                    }}
                  />
                  {submissionErrors.logo
                    ? <p role="alert" className="mt-1 px-1 text-xs font-medium text-danger">{submissionErrors.logo}</p>
                    : null}
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-secondary/65 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold">需要特殊网络环境</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">开启后将在网站卡片上展示 VPN 提示</p>
                  </div>
                  <Switch aria-label="访问该网站需要 VPN" name="vpn" isSelected={vpn} value="on" onChange={setVpn}>
                    {({ isSelected }) => (
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb>
                            <Switch.Icon>
                              {isSelected ? <Check className="size-3" /> : <Xmark className="size-3 opacity-70" />}
                            </Switch.Icon>
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch.Content>
                    )}
                  </Switch>
                </div>
              </Form>
            </Modal.Body>

            <Modal.Footer className="flex items-center justify-between px-5 py-3 sm:px-6">
              {submissionErrors.logo || submissionErrors.category
                ? (
                    <p aria-live="assertive" role="alert" className="flex items-center gap-1.5 text-[10px] font-bold text-danger">
                      <TriangleExclamation className="size-3.5" />
                      {submissionErrors.logo ?? submissionErrors.category}
                    </p>
                  )
                : (
                    <p className="hidden items-center gap-1.5 text-[10px] text-muted sm:flex">
                      <ShieldCheck className="size-3.5" />
                      仅支持 HTTPS，每 24 小时最多提交 3 次
                    </p>
                  )}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="tertiary" isDisabled={loading || extracting} slot="close" onPress={state.close}>取消</Button>
                <Button
                  type="submit"
                  isDisabled={categoryLoading || !categories.length || extracting}
                  isPending={loading}
                  form="website-submission-form"
                  className="min-w-28"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : <PaperPlane />}
                      {isPending ? '提交中…' : '提交审核'}
                      {!isPending && <ArrowRight className="size-3.5" />}
                    </>
                  )}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

function focusSubmissionTarget(targetId: string) {
  window.requestAnimationFrame(() => {
    const target = document.getElementById(targetId)
    if (!target)
      return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = target.querySelector<HTMLElement>('input, textarea, button, [tabindex]:not([tabindex="-1"])')
    focusable?.focus({ preventScroll: true })
  })
}

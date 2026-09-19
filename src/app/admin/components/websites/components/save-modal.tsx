'use client'
import { Check, CircleCheckFill, MagicWand, Xmark } from '@gravity-ui/icons'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  NumberField,
  Spinner,
  Switch,
  SwitchGroup,
  TextArea,
  TextField,
  toast,

} from '@heroui/react'
import { useState } from 'react'

import CategoryMultiSelect from '@/components/ui/category-multi-select'
import TagInputs from '@/components/ui/tag-inputs'
import useRequest from '@/hooks/use-request'
import { request } from '@/lib/request'
import { generateLogoUrl, get, RESPONSE } from '@/lib/utils'
import { extractionIconToFile } from '@/lib/website-extraction-client'

import LogoUpload from './logo-upload'

import type { FileWithPreview } from '@/hooks/use-file-upload'
import type { CategoryOption, Website, WebsiteExtractionResult, WebsiteSaveParams } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { Dispatch, FC, FormEvent, SetStateAction } from 'react'

const SwitchOptions: { name: string, label: string }[] = [
  { name: 'pinned', label: '置顶' },
  { name: 'vpn', label: 'VPN' },
  { name: 'recommend', label: '推荐' },
  { name: 'commonlyUsed', label: '常用' },
]

interface SaveModalProps {
  state: UseOverlayStateReturn
  initialValues: Website | null
  handleRefresh: VoidFunction
  tags: string[]
  setTags: Dispatch<SetStateAction<string[]>>
  categorysList: CategoryOption[]
}

const SaveModal: FC<SaveModalProps> = ({
  state,
  initialValues,
  handleRefresh,
  tags = [],
  setTags,
  categorysList = [],
}) => {
  const actionText = initialValues ? '编辑' : '新增'
  // Logo 链接
  const logoUrl = initialValues?.logo ? generateLogoUrl(initialValues.logo) : undefined
  // Logo
  const [logoFile, setLogoFile] = useState<FileWithPreview['file'] | null>(null)
  const [extractedLogoPreview, setExtractedLogoPreview] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [categoryIds, setCategoryIds] = useState<string[]>(() =>
    initialValues?.category_ids?.length
      ? initialValues.category_ids
      : initialValues?.category_id
        ? [initialValues.category_id]
        : [],
  )
  const [draft, setDraft] = useState({
    desc: initialValues?.desc ?? '',
    name: initialValues?.name ?? '',
    url: initialValues?.url ?? '',
  })

  // 上传成功回调
  const onSuccess = () => {
    state.close()
    toast.success('提交成功', {
      timeout: 2000,
      indicator: <CircleCheckFill />,
    })
    handleRefresh?.()
  }

  // 上传 Logo
  const { loading: uploadLoading, run: fetchUploadLogo } = useRequest('/websites/:id/logo', {
    method: 'PUT',
    manual: true,
    onSuccess: ({ code }) => {
      if (code === RESPONSE.SUCCESS) {
        onSuccess()
      }
    },
  })

  // 保存表单
  const { loading, run } = useRequest<Website>('/websites', {
    method: initialValues?.id ? 'PUT' : 'POST',
    manual: true,
    onSuccess: ({ code, data }) => {
      if (code === RESPONSE.SUCCESS) {
        if (data?.id && logoFile) {
          const formData = new FormData()
          formData.append('file', logoFile as File)
          void fetchUploadLogo(data.id, formData).catch(() => {})
        }
        else {
          onSuccess()
        }
      }
    },
  })

  // url
  const validateUrl = (value: string) => {
    if (!value) {
      return '请输入网站链接'
    }

    let url: URL
    try {
      url = new URL(value)
    }
    catch {
      return '请输入合法的 URL'
    }

    if (url.protocol !== 'https:') {
      return '网站链接必须以 https:// 开头'
    }

    const hostname = url.hostname

    // 允许 IP（可选）
    const isIP
      = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)
        || /^\[[0-9a-f:]+\]$/i.test(hostname) // IPv6

    // 至少包含一个点（example.com）
    const hasDot = hostname.includes('.')

    if (!hasDot && !isIP) {
      return '请输入有效的域名（如 https://example.com）'
    }

    return null
  }

  const extractWebsite = async () => {
    const validationError = validateUrl(draft.url)
    if (validationError) {
      toast.danger(validationError)
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

  // 表单提交
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (!categoryIds.length) {
      toast.danger('请至少选择一个分类')
      return
    }

    const data: WebsiteSaveParams = {
      // string
      category_id: categoryIds[0]!,
      category_ids: categoryIds,
      name: formData.get('name') as string,
      desc: (formData.get('desc') as string) ?? '',
      url: formData.get('url') as string,
      logo: (logoFile ? null : initialValues?.logo) ?? null,

      // number
      sort: Number(formData.get('sort')),

      // boolean（checkbox 选中才会存在）
      pinned: formData.has('pinned'),
      vpn: formData.has('vpn'),
      recommend: formData.has('recommend'),
      commonlyUsed: formData.has('commonlyUsed'),

      tags,
    }
    // 新增必须上传 Logo
    if (!initialValues && !logoFile) {
      toast.danger('请上传网站logo', {
        timeout: 2000,
        indicator: <Xmark />,
      })
      return
    }
    await (initialValues?.id ? run(initialValues.id, data) : run(data)).catch(() => {})
  }
  return (
    <Modal.Backdrop
      variant="blur"
      isDismissable={!loading && !uploadLoading}
      isKeyboardDismissDisabled={loading || uploadLoading}
      isOpen={state.isOpen}
      onOpenChange={state.setOpen}
    >
      <Modal.Container size="lg" placement="center" scroll="inside" className="overscroll-contain">
        <Modal.Dialog className="overflow-hidden sm:max-w-3xl">
          <Modal.CloseTrigger aria-label="关闭网站编辑器" onPress={state.close} />
          <Modal.Header className="border-b border-border px-5 py-4 sm:px-6">
            <Modal.Heading>{`${actionText}网站`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4 sm:px-6 sm:py-5">
            <Form key={initialValues?.id ?? 'create'} id="website-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <CategoryMultiSelect
                  categories={categorysList}
                  disabled={loading || uploadLoading}
                  value={categoryIds}
                  onChange={setCategoryIds}
                />
                <TextField
                  name="name"
                  isRequired
                  maxLength={100}
                  minLength={1}
                  validate={value => value ? null : '请输入网站名称'}
                  value={draft.name}
                  onChange={name => setDraft(current => ({ ...current, name }))}
                >
                  <Label>网站名称</Label>
                  <Input aria-label="网站名称" variant="secondary" fullWidth placeholder="请输入网站名称" />
                  <FieldError />
                </TextField>
              </div>
              <div className="flex items-end gap-2">
                <TextField
                  name="url"
                  isRequired
                  minLength={1}
                  validate={validateUrl}
                  value={draft.url}
                  onChange={url => setDraft(current => ({ ...current, url }))}
                  className="min-w-0 flex-1"
                >
                  <Label>网站链接</Label>
                  <Input aria-label="网站链接" variant="secondary" fullWidth placeholder="https://example.com" />
                  <FieldError />
                </TextField>
                <Button
                  type="button"
                  variant="secondary"
                  isDisabled={loading || uploadLoading}
                  isPending={extracting}
                  onPress={() => void extractWebsite()}
                  className="shrink-0"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : <MagicWand />}
                      一键提取
                    </>
                  )}
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Label isRequired htmlFor="logo">Logo</Label>
                <LogoUpload
                  appearance="submission"
                  defaultAvatar={logoUrl}
                  externalPreview={extractedLogoPreview}
                  onExternalClear={() => {
                    setExtractedLogoPreview(null)
                    setLogoFile(null)
                  }}
                  onFileChange={(value) => {
                    setLogoFile(value?.file || null)
                    if (value)
                      setExtractedLogoPreview(null)
                  }}
                />
                <p className="text-center text-[11px] text-muted">保存时写入当前选择的文件存储</p>
              </div>
              <TagInputs value={tags} onChange={setTags} />
              <TextField
                name="desc"
                maxLength={500}
                value={draft.desc}
                onChange={desc => setDraft(current => ({ ...current, desc }))}
              >
                <Label>网站描述</Label>
                <TextArea aria-label="网站描述" variant="secondary" fullWidth placeholder="请输入网站描述" rows={3} />
              </TextField>
              <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label>网站属性</Label>
                  <SwitchGroup orientation="horizontal" className="flex-wrap">
                    {SwitchOptions.map(({ name, label }) => (
                      <Switch key={name} name={name} defaultSelected={get(initialValues, name, false)} value="on">
                        {({ isSelected }) => (
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb>
                                <Switch.Icon>
                                  {isSelected ? <Check className="size-3 text-inherit opacity-100" /> : <Xmark className="size-3 text-inherit opacity-70" />}
                                </Switch.Icon>
                              </Switch.Thumb>
                            </Switch.Control>
                            {label}
                          </Switch.Content>
                        )}
                      </Switch>
                    ))}
                  </SwitchGroup>
                </div>
                <NumberField
                  name="sort"
                  variant="secondary"
                  isRequired
                  defaultValue={initialValues?.sort ?? 1}
                  maxValue={99}
                  minValue={1}
                  validate={value => value ? null : '请输入排序'}
                >
                  <Label>排序</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
              </div>
            </Form>
          </Modal.Body>
          <Modal.Footer className="border-t border-border px-5 py-3 sm:px-6">
            <Button variant="outline" isDisabled={loading || uploadLoading} slot="close" onPress={state.close}>
              取消
            </Button>
            <Button type="submit" isPending={loading || uploadLoading} form="website-form">
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {loading ? '正在提交...' : uploadLoading ? '正在上传 Logo...' : '确定'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
export default SaveModal

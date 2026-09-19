'use client'

import { ArrowRotateLeft, Check, Picture, TrashBin } from '@gravity-ui/icons'
import {
  AlertDialog,
  Button,
  Label,
  ProgressBar,
  Radio,
  RadioGroup,
  Slider,
  Spinner,
  toast,
} from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import { ProfileBackdrop } from '@/components/Profile/profile-backdrop'
import { ProfileThemeScope } from '@/components/Profile/profile-theme'
import { ProfileThemeArtwork } from '@/components/Profile/profile-theme-artwork'
import profileStyles from '@/components/Profile/profile.module.css'
import {
  DEFAULT_PROFILE_APPEARANCE,
  PROFILE_APPEARANCE_PRESETS,
  PROFILE_BACKGROUND_FITS,
} from '@/lib/account/appearance'
import { PROFILE_THEME_TOKENS } from '@/lib/account/profile-theme'
import { ApiRequestError, request } from '@/lib/request'
import { uploadProfileBackground } from '@/lib/wonderland/client-upload'

import futureStyles from './appearance-editor-future-themes.module.css'
import styles from './appearance-editor.module.css'

import type {
  ProfileAppearance,
  ProfileAppearancePreset,
  ProfileBackgroundFit,
} from '@/lib/account/appearance'

const FIT_LABELS: Record<ProfileBackgroundFit, string> = {
  contain: '完整显示',
  cover: '铺满',
  custom: '自定义',
}

interface AppearanceEditorProps {
  appearance: ProfileAppearance
  name: string
  onSaved: (appearance: ProfileAppearance) => void
}

export default function AppearanceEditor({ appearance, name, onSaved }: AppearanceEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const allowNavigationRef = useRef(false)
  const savedAppearanceRef = useRef(appearance)
  const [draft, setDraft] = useState(appearance)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const isDirty = appearanceKey(draft) !== appearanceKey(savedAppearanceRef.current)
  const hasUnsavedWork = isDirty || uploading

  useEffect(() => () => {
    if (previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!hasUnsavedWork)
      return

    const protectUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current)
        return
      event.preventDefault()
      event.returnValue = ''
    }
    const protectNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!target || target.target === '_blank' || target.hasAttribute('download'))
        return
      const destination = new URL(target.href, window.location.href)
      if (destination.href === window.location.href)
        return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(destination.href)
    }

    window.addEventListener('beforeunload', protectUnload)
    document.addEventListener('click', protectNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', protectUnload)
      document.removeEventListener('click', protectNavigation, true)
    }
  }, [hasUnsavedWork])

  const chooseBackground = async (file?: File | null) => {
    if (!file || saving || uploading)
      return
    setUploading(true)
    setUploadProgress(0)
    try {
      const uploaded = await uploadProfileBackground(file, setUploadProgress)
      if (previewUrl?.startsWith('blob:'))
        URL.revokeObjectURL(previewUrl)
      const nextUrl = URL.createObjectURL(file)
      setPreviewUrl(nextUrl)
      setDraft(current => ({
        ...current,
        backgroundFileId: uploaded.fileId,
        backgroundUrl: nextUrl,
      }))
      toast.success('背景已上传，保存外观后公开生效')
    }
    catch (error) {
      reportAppearanceError(error)
    }
    finally {
      setUploading(false)
      if (inputRef.current)
        inputRef.current.value = ''
    }
  }

  const saveAppearance = async () => {
    if (saving || uploading)
      return
    setSaving(true)
    try {
      const result = await request<ProfileAppearance>('/account/appearance', {
        body: JSON.stringify({
          backgroundFileId: draft.backgroundFileId,
          fit: draft.fit,
          height: draft.height,
          opacity: draft.opacity,
          positionX: draft.positionX,
          positionY: draft.positionY,
          preset: draft.preset,
          scale: draft.scale,
        }),
        method: 'PATCH',
      })
      if (previewUrl?.startsWith('blob:'))
        URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      savedAppearanceRef.current = result.data
      setDraft(result.data)
      onSaved(result.data)
      toast.success('主页外观已保存')
    }
    catch (error) {
      reportAppearanceError(error)
    }
    finally {
      setSaving(false)
    }
  }

  const resetAppearance = () => {
    if (previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setDraft({ ...DEFAULT_PROFILE_APPEARANCE })
    toast('已恢复默认预览，保存后公开生效')
  }

  const removeBackground = () => {
    if (previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setDraft(current => ({ ...current, backgroundFileId: null, backgroundUrl: null }))
  }

  const onPaste = (event: React.ClipboardEvent) => {
    const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
    if (image) {
      event.preventDefault()
      void chooseBackground(image)
    }
  }

  return (
    <div className={`${styles.editor} ${futureStyles.futureEditor}`}>
      <ProfileThemeScope variant="preview" preset={draft.preset} className={styles.previewScope}>
        <ProfileBackdrop
          variant="preview"
          appearance={draft}
          imageUrl={previewUrl ?? draft.backgroundUrl}
          className={styles.preview}
        >
          <div className={styles.previewProfile}>
            <div className={styles.previewIdentity}>
              <span aria-hidden="true" data-profile-preview-avatar="" className={styles.previewAvatar}>{name.slice(0, 1)}</span>
              <div>
                <p data-profile-preview-eyebrow="" className={profileStyles.eyebrow}>公开主页实时预览</p>
                <p data-profile-preview-name="" className={styles.previewName}>{name}</p>
                <p data-profile-preview-hint="" className={styles.previewHint}>主题只作用于封面场景，正文始终保持清晰、克制。</p>
                <span data-profile-preview-verified="" className={styles.previewVerified}>
                  <Check aria-hidden="true" />
                  主页内容保持原位
                </span>
              </div>
            </div>
            <dl aria-label="预览数据" data-profile-preview-stats="" className={styles.previewStats}>
              <div>
                <dt>提问</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>回答</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>作品</dt>
                <dd>0</dd>
              </div>
            </dl>
          </div>
        </ProfileBackdrop>
      </ProfileThemeScope>

      <div className={styles.controls}>
        <RadioGroup
          aria-label="主页主题"
          isDisabled={saving}
          value={draft.preset}
          onChange={value => setDraft(current => ({ ...current, preset: value as ProfileAppearancePreset }))}
          className={styles.presetGroup}
        >
          <Label>
            <span className={styles.themeLabel}>
              <span>主页主题</span>
              <small>
                {PROFILE_APPEARANCE_PRESETS.length}
                {' 套完整场景 · 选择后实时预览'}
              </small>
            </span>
          </Label>
          <div className={styles.presetGrid}>
            {PROFILE_APPEARANCE_PRESETS.map(preset => (
              <Radio
                key={preset}
                data-default={preset === DEFAULT_PROFILE_APPEARANCE.preset ? 'true' : undefined}
                data-preset={preset}
                value={preset}
                className={styles.presetOption}
              >
                <Radio.Content>
                  <Radio.Control><Radio.Indicator /></Radio.Control>
                  <span data-preset={preset} data-theme-swatch="" className={styles.presetSwatch}>
                    <ProfileThemeArtwork variant="thumbnail" preset={preset} />
                  </span>
                  <span className={styles.presetCopy}>
                    <span className={styles.presetTitle}>
                      <strong>{PROFILE_THEME_TOKENS[preset].label}</strong>
                      {preset === DEFAULT_PROFILE_APPEARANCE.preset ? <em>默认</em> : null}
                    </span>
                    <span className={styles.presetFamily}>{PROFILE_THEME_TOKENS[preset].family}</span>
                    <small>{PROFILE_THEME_TOKENS[preset].description}</small>
                  </span>
                </Radio.Content>
              </Radio>
            ))}
          </div>
        </RadioGroup>

        <div onPaste={onPaste} className={styles.uploadBlock}>
          <div>
            <p className={styles.controlLabel}>图片背景</p>
            <p className={styles.controlHelp}>不上传时使用完整默认主题；上传后保留主题色与文字保护。支持 PNG、JPG、WebP，最大 8MB。</p>
          </div>
          <button
            type="button"
            disabled={uploading || saving}
            onClick={() => inputRef.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void chooseBackground(event.dataTransfer.files[0])
            }}
            className={styles.uploadZone}
          >
            {uploading ? <Spinner color="current" size="sm" /> : <Picture aria-hidden="true" className="size-4" />}
            {uploading ? '正在处理背景…' : '上传、拖入或粘贴图片'}
          </button>
          <input
            ref={inputRef}
            aria-label="选择主页背景图片"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading || saving}
            onChange={event => void chooseBackground(event.target.files?.[0])}
            className="sr-only"
          />
          {uploading
            ? (
                <ProgressBar aria-label="背景上传进度" value={uploadProgress}>
                  <ProgressBar.Track className="h-1 overflow-hidden rounded-full bg-default/10">
                    <ProgressBar.Fill className="rounded-full bg-accent" />
                  </ProgressBar.Track>
                </ProgressBar>
              )
            : null}
          {draft.backgroundFileId
            ? (
                <Button size="sm" variant="tertiary" isDisabled={uploading || saving} onPress={removeBackground}>
                  <TrashBin />
                  使用默认背景
                </Button>
              )
            : null}
        </div>

        <RadioGroup
          aria-label="图片显示方式"
          variant="secondary"
          isDisabled={saving}
          orientation="horizontal"
          value={draft.fit}
          onChange={value => setDraft(current => ({
            ...current,
            fit: value as ProfileBackgroundFit,
            scale: value === 'custom' ? current.scale : 100,
          }))}
          className={styles.fitGroup}
        >
          <Label>图片显示方式</Label>
          <div className={styles.fitOptions}>
            {PROFILE_BACKGROUND_FITS.map(fit => (
              <Radio key={fit} value={fit}>
                <Radio.Content>
                  <Radio.Control><Radio.Indicator /></Radio.Control>
                  {FIT_LABELS[fit]}
                </Radio.Content>
              </Radio>
            ))}
          </div>
        </RadioGroup>

        <div className={styles.sliderGrid}>
          <AppearanceSlider
            isDisabled={saving}
            label="图片透明度"
            max={100}
            min={0}
            suffix="%"
            value={draft.opacity}
            onChange={opacity => setDraft(current => ({ ...current, opacity }))}
          />
          <AppearanceSlider
            isDisabled={saving}
            label="封面高度"
            max={520}
            min={180}
            suffix="px"
            value={draft.height}
            onChange={height => setDraft(current => ({ ...current, height }))}
          />
          <AppearanceSlider
            isDisabled={saving}
            label="水平焦点"
            max={100}
            min={0}
            suffix="%"
            value={draft.positionX}
            onChange={positionX => setDraft(current => ({ ...current, positionX }))}
          />
          <AppearanceSlider
            isDisabled={saving}
            label="垂直焦点"
            max={100}
            min={0}
            suffix="%"
            value={draft.positionY}
            onChange={positionY => setDraft(current => ({ ...current, positionY }))}
          />
          <AppearanceSlider
            isDisabled={saving || draft.fit !== 'custom'}
            label="图片缩放"
            max={200}
            min={50}
            suffix="%"
            value={draft.scale}
            onChange={scale => setDraft(current => ({ ...current, scale }))}
          />
        </div>

        <div className={styles.actions}>
          <p>移动端会将装饰图片高度安全收敛到 360px，身份内容不会被裁切。</p>
          <div className={styles.actionButtons}>
            <Button size="sm" variant="tertiary" isDisabled={uploading || saving} onPress={resetAppearance}>
              <ArrowRotateLeft />
              恢复默认
            </Button>
            <Button size="sm" isDisabled={uploading || saving} isPending={saving} onPress={saveAppearance}>
              {({ isPending }) => isPending
                ? (
                    <>
                      <Spinner color="current" size="sm" />
                      保存中…
                    </>
                  )
                : (
                    <>
                      <Check />
                      保存外观
                    </>
                  )}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog.Backdrop
        variant="blur"
        isDismissable
        isKeyboardDismissDisabled={false}
        isOpen={Boolean(pendingHref)}
        onOpenChange={isOpen => !isOpen && setPendingHref(null)}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className={styles.leaveDialog}>
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>外观还没有保存</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>刚才选择的主题或背景仍只在预览中。继续离开会放弃这些调整。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" slot="close" onPress={() => setPendingHref(null)}>继续编辑</Button>
              <Button
                variant="danger"
                slot="close"
                onPress={() => {
                  if (!pendingHref)
                    return
                  allowNavigationRef.current = true
                  window.location.assign(pendingHref)
                }}
              >
                放弃更改并离开
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}

function appearanceKey(appearance: ProfileAppearance) {
  return JSON.stringify({
    backgroundFileId: appearance.backgroundFileId,
    fit: appearance.fit,
    height: appearance.height,
    opacity: appearance.opacity,
    positionX: appearance.positionX,
    positionY: appearance.positionY,
    preset: appearance.preset,
    scale: appearance.scale,
  })
}

function AppearanceSlider({
  isDisabled = false,
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  isDisabled?: boolean
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  suffix: string
  value: number
}) {
  return (
    <Slider
      aria-label={label}
      isDisabled={isDisabled}
      maxValue={max}
      minValue={min}
      step={1}
      value={value}
      onChange={next => onChange(Array.isArray(next) ? next[0]! : next)}
      className={styles.slider}
    >
      <Label>{label}</Label>
      <Slider.Output>
        {value}
        {suffix}
      </Slider.Output>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  )
}

function reportAppearanceError(error: unknown) {
  if (error instanceof ApiRequestError && error.notified)
    return
  toast.danger(error instanceof Error ? error.message : '主页外观操作失败')
}

'use client'
import { CircleXmarkFill, CloudArrowUpIn, Picture, Xmark } from '@gravity-ui/icons'
import {
  Alert,
  Button,
  cn,
  Description,
  Surface,
  toast,
  useOverlayState,
} from '@heroui/react'
import Image from 'next/image'
import { useMemo, useState } from 'react'

import { formatBytes, useFileUpload } from '@/hooks/use-file-upload'

import CropLogoModal from './crop-logo-modal'

import type { FileWithPreview } from '@/hooks/use-file-upload'
import type { ClipboardEvent, FC } from 'react'

interface LogoUploadProps {
  maxSize?: number
  accept?: string
  className?: string
  appearance?: 'default' | 'submission'
  externalPreview?: string | null
  onFileChange?: (file: FileWithPreview | null) => void
  onExternalClear?: () => void
  defaultAvatar?: string
}

const LogoUpload: FC<LogoUploadProps> = ({
  maxSize = 1 * 1024 * 1024, // 1MB
  accept = 'image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico',
  className,
  appearance = 'default',
  externalPreview,
  onFileChange,
  onExternalClear,
  defaultAvatar,
}) => {
  const [innerFile, setInnerFile] = useState<FileWithPreview | null>(null)
  const cropModalState = useOverlayState()
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [
    { isDragging, errors },
    { addFiles, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps },
  ] = useFileUpload({
    maxFiles: 1,
    maxSize,
    accept,
    multiple: false,
    onFilesChange: (files) => {
      const file = files[0]
      if (!file?.preview)
        return
      setCropImage(file.preview)
      cropModalState.open()
    },
    onError: (errors) => {
      if (errors?.length) {
        toast.danger(errors[0], {
          timeout: 2000,
          indicator: <CircleXmarkFill />,
        })
      }
    },
  })

  const previewUrl = useMemo(
    () => innerFile?.preview ?? externalPreview ?? defaultAvatar,
    [defaultAvatar, externalPreview, innerFile],
  )

  const clearLogo = () => {
    setInnerFile(null)
    onFileChange?.(null)
    onExternalClear?.()
  }

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (!images.length)
      return
    event.preventDefault()
    addFiles(images.slice(0, 1))
  }

  return (
    <>
      <div className={cn(appearance === 'submission' ? 'w-full' : 'flex flex-col items-center gap-3', className)}>
        {appearance === 'submission'
          ? (
              <div className="relative">
                <input {...getInputProps()} className="sr-only" />
                <button
                  type="button"
                  onClick={openFileDialog}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onPaste={handlePaste}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl border border-border bg-surface-secondary/65 p-3 text-left outline-none transition-[background-color,border-color,box-shadow] hover:border-foreground/15 hover:bg-surface-secondary focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/20',
                    isDragging && 'border-success bg-success-soft ring-2 ring-success/20',
                  )}
                >
                  <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-xs">
                    {previewUrl
                      ? <Image alt="Logo" fill src={previewUrl} className="object-cover" />
                      : <Picture className="size-6 text-muted transition-transform group-hover:scale-105" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-xs font-bold">{previewUrl ? 'Logo 已准备好' : '上传网站 Logo'}</span>
                    <span className="mt-1 hidden text-[10px] text-muted sm:block">
                      可选择、拖入或粘贴 PNG、JPG、WebP、ICO，最大
                      {' '}
                      {formatBytes(maxSize)}
                    </span>
                    <span className="mt-1 block whitespace-nowrap text-[9px] text-muted sm:hidden">PNG/JPG/WebP · 1MB</span>
                  </span>
                  <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px] font-bold shadow-xs transition-colors group-hover:bg-surface-tertiary">
                    <CloudArrowUpIn className="size-3.5" />
                    <span className="hidden sm:inline">{previewUrl ? '更换' : '选择图片'}</span>
                  </span>
                </button>

                {(innerFile || externalPreview) && (
                  <Button
                    aria-label="删除 Logo"
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    onPress={clearLogo}
                    className="absolute right-24 top-1/2 size-7 -translate-y-1/2 bg-surface text-foreground"
                  >
                    <Xmark />
                  </Button>
                )}
              </div>
            )
          : (
              <>
                <div className="relative">
                  <div
                    onClick={openFileDialog}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onPaste={handlePaste}
                    className={cn(
                      'group/avatar relative h-24 w-24 cursor-pointer overflow-hidden rounded-full border border-dashed transition-colors',
                      isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/20',
                      previewUrl && 'border-solid',
                    )}
                  >
                    <input {...getInputProps()} className="sr-only" />

                    {previewUrl
                      ? <Image alt="Logo" fill src={previewUrl} className="object-cover" />
                      : <div className="flex size-full items-center justify-center"><Picture className="size-8 text-muted-foreground" /></div>}
                  </div>

                  {(innerFile || externalPreview) && (
                    <Button
                      aria-label="删除 Logo"
                      size="sm"
                      variant="outline"
                      isIconOnly
                      onPress={clearLogo}
                      className="absolute inset-e-0 top-0 size-6"
                    >
                      <Xmark />
                    </Button>
                  )}
                </div>

                <Description className="text-center">
                  请上传小于
                  {' '}
                  {formatBytes(maxSize)}
                  {' '}
                  的图片
                </Description>
              </>
            )}

        {/* Error Messages */}
        {errors.length > 0 && (
          <Surface variant="secondary" className="w-full rounded-3xl p-4">
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>上传失败</Alert.Title>
                <Alert.Description>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                    {errors.map(error => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </Surface>
        )}
      </div>
      <CropLogoModal
        image={cropImage}
        state={cropModalState}
        onConfirm={(file) => {
          setInnerFile(file)
          onFileChange?.(file)
        }}
      />
    </>
  )
}
export default LogoUpload

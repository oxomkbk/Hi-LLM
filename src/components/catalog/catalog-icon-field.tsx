'use client'

import { Puzzle, Server, TrashBin } from '@gravity-ui/icons'
import {
  Button,
  Description,
  Input,
  Label,
  TextField,
} from '@heroui/react'
import { useState } from 'react'

import MediaPicker from '@/components/media/media-picker'
import { catalogIconSource } from '@/lib/catalog-icons'
import { uploadCatalogIcon, uploadCommunityCatalogIcon } from '@/lib/wonderland/client-upload'

import styles from './catalog-icon-field.module.css'

interface CatalogIconFieldProps {
  kind: 'mcp' | 'skill'
  name: string
  onBusyChange?: (busy: boolean) => void
  onChange: (value: string) => void
  readOnly?: boolean
  uploadMode?: 'admin' | 'submission'
  value: string
}

export default function CatalogIconField({ kind, name, onBusyChange, onChange, readOnly = false, uploadMode = 'admin', value }: CatalogIconFieldProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const source = catalogIconSource(value)
  const isUploaded = value.trim().startsWith('file:') || value.trim().startsWith('/api/files/')
  const externalValue = isUploaded ? '' : value
  const Fallback = kind === 'skill' ? Puzzle : Server

  const upload = async (file: File, onProgress: (percent: number) => void) => {
    setError(null)
    setFailedSource(null)
    onBusyChange?.(true)
    try {
      return uploadMode === 'submission'
        ? await uploadCommunityCatalogIcon(file, kind, onProgress)
        : await uploadCatalogIcon(file, onProgress)
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '图标上传失败，请稍后重试')
      throw reason
    }
    finally {
      onBusyChange?.(false)
    }
  }

  return (
    <div id={`${kind}-field-icon`} className={styles.field}>
      <div className={styles.labelRow}>
        <Label>品牌图标（可选）</Label>
        <small>推荐正方形 PNG、JPG 或 WebP，最大 2MB</small>
      </div>

      <div className={styles.uploadSurface}>
        <span aria-hidden="true" className={styles.preview}>
          {source && source !== failedSource
            ? (
                // Uploaded images are served by app routes or arbitrary public HTTPS hosts.
                // eslint-disable-next-line next/no-img-element
                <img alt="" height={64} src={source} width={64} onError={() => setFailedSource(source)} />
              )
            : <Fallback />}
        </span>
        <div className={styles.uploadCopy}>
          <strong>{source ? (isUploaded ? '已上传站内图标' : '正在使用外部图标') : `${name || (kind === 'skill' ? 'Skill' : 'MCP')} 默认图标`}</strong>
          <span>可以复用已有素材，也可以在同一窗口上传新图标。</span>
        </div>
        <div className={styles.actions}>
          <MediaPicker
            title={`选择 ${kind === 'skill' ? 'Skill' : 'MCP'} 图标`}
            isDisabled={readOnly}
            accept="image/png,image/jpeg,image/webp"
            buttonLabel={source ? '更换图标' : '选择图标'}
            kind="image"
            onSelect={(item) => {
              setFailedSource(null)
              setError(null)
              onChange(`file:${item.id}`)
            }}
            onUpload={upload}
          />
          {source
            ? (
                <Button
                  aria-label="移除图标"
                  type="button"
                  size="sm"
                  variant="ghost"
                  isDisabled={readOnly}
                  isIconOnly
                  onPress={() => {
                    setFailedSource(null)
                    onChange('')
                  }}
                >
                  <TrashBin />
                </Button>
              )
            : null}
        </div>
      </div>

      <TextField
        type="url"
        isReadOnly={readOnly}
        fullWidth
        value={externalValue}
        onChange={(next) => {
          setFailedSource(null)
          setError(null)
          onChange(next)
        }}
      >
        <Label>或使用 HTTPS 图片地址</Label>
        <Input variant="secondary" placeholder="https://example.com/icon.png" spellCheck={false} />
        <Description>已上传图标会存储在站内；填写外部地址会替换当前上传图标。</Description>
      </TextField>
      <p aria-live="polite" data-error={Boolean(error)} className={styles.status}>
        {error ?? ''}
      </p>
    </div>
  )
}

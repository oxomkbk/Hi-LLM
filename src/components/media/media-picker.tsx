'use client'

import { CloudArrowUpIn, FolderOpen } from '@gravity-ui/icons'
import {
  Button,
  Modal,
  SearchField,
  Spinner,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import { request } from '@/lib/request'

import styles from './media-picker.module.css'

import type { ReactNode } from 'react'

export interface MediaPickerItem {
  createdAt: string
  id: string
  mimeType: string
  name: string
  owner?: { email: string | null, id: string | null }
  sizeBytes: number
  url: string
}

interface MediaPage {
  list: MediaPickerItem[]
  page: number
  pageSize: number
  total: number
}

interface MediaPickerProps {
  accept?: string
  buttonLabel?: string
  fullWidth?: boolean
  isDisabled?: boolean
  kind?: 'all' | 'image' | 'video'
  onSelect: (item: MediaPickerItem) => void
  onUpload?: (file: File, onProgress: (percent: number) => void) => Promise<{ fileId: string, name: string }>
  title?: string
  trigger?: (open: () => void) => ReactNode
}

export default function MediaPicker({
  accept,
  buttonLabel = '选择素材',
  fullWidth = false,
  isDisabled = false,
  kind = 'all',
  onSelect,
  onUpload,
  title = '选择素材',
  trigger,
}: MediaPickerProps) {
  const modal = useOverlayState()
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<MediaPickerItem[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [selected, setSelected] = useState<MediaPickerItem | null>(null)
  const open = () => {
    setSelected(null)
    modal.open()
  }

  useEffect(() => {
    if (!modal.isOpen)
      return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await request<MediaPage>('/media', {
          params: { kind, page: 1, pageSize: 48, q: q.trim() || undefined },
          signal: controller.signal,
        })
        setItems(response.data.list.filter(item => matchesAccept(item, accept)))
      }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setItems([])
      }
      finally {
        if (!controller.signal.aborted)
          setLoading(false)
      }
    }, q ? 220 : 0)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [accept, kind, modal.isOpen, q])

  const upload = async (file?: File) => {
    if (!file || !onUpload)
      return
    setUploadProgress(0)
    try {
      const result = await onUpload(file, setUploadProgress)
      onSelect({
        createdAt: new Date().toISOString(),
        id: result.fileId,
        mimeType: file.type || 'application/octet-stream',
        name: result.name,
        sizeBytes: file.size,
        url: `/api/files/${result.fileId}`,
      })
      modal.close()
    }
    catch (error) {
      toast.danger(error instanceof Error ? error.message : '素材上传失败，请稍后重试')
    }
    finally {
      setUploadProgress(null)
      if (fileRef.current)
        fileRef.current.value = ''
    }
  }

  return (
    <>
      {trigger
        ? trigger(open)
        : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isDisabled={isDisabled}
              fullWidth={fullWidth}
              onPress={open}
            >
              <FolderOpen aria-hidden="true" />
              {buttonLabel}
            </Button>
          )}
      <Modal.Backdrop
        variant="blur"
        isDismissable={uploadProgress === null}
        isKeyboardDismissDisabled={uploadProgress !== null}
        isOpen={modal.isOpen}
        onOpenChange={modal.setOpen}
      >
        <Modal.Container size="lg" placement="center" scroll="inside">
          <Modal.Dialog className={styles.dialog}>
            <Modal.CloseTrigger aria-label="关闭素材库" />
            <Modal.Header className={styles.header}>
              <div>
                <Modal.Heading>{title}</Modal.Heading>
                <p>选择已经上传的素材，或在这里上传新素材。</p>
              </div>
            </Modal.Header>
            <Modal.Body className={styles.body}>
              <div className={styles.toolbar}>
                <SearchField aria-label="搜索素材" variant="secondary" value={q} onChange={setQ} className={styles.search}>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="搜索文件名" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
                {onUpload
                  ? (
                      <>
                        <input
                          ref={fileRef}
                          aria-label="上传新素材"
                          type="file"
                          accept={accept}
                          disabled={uploadProgress !== null}
                          hidden
                          onChange={event => void upload(event.target.files?.[0])}
                        />
                        <Button
                          type="button"
                          variant="primary"
                          isPending={uploadProgress !== null}
                          onPress={() => fileRef.current?.click()}
                        >
                          {uploadProgress === null ? <CloudArrowUpIn aria-hidden="true" /> : <Spinner color="current" size="sm" />}
                          {uploadProgress === null ? '上传新素材' : `上传中 ${uploadProgress}%`}
                        </Button>
                      </>
                    )
                  : null}
              </div>

              {loading
                ? (
                    <div className={styles.empty}>
                      <Spinner />
                      <span>正在加载素材…</span>
                    </div>
                  )
                : items.length
                  ? (
                      <div className={styles.grid}>
                        {items.map(item => (
                          <button
                            key={item.id}
                            aria-pressed={selected?.id === item.id}
                            type="button"
                            data-selected={selected?.id === item.id}
                            onClick={() => setSelected(item)}
                            onDoubleClick={() => {
                              onSelect(item)
                              modal.close()
                            }}
                            className={styles.item}
                          >
                            <span className={styles.thumbnail}>
                              {item.mimeType.startsWith('image/')
                                // eslint-disable-next-line next/no-img-element
                                ? <img alt="" src={item.url} />
                                : <span className={styles.fileType}>{item.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}</span>}
                            </span>
                            <span className={styles.itemCopy}>
                              <strong title={item.name}>{item.name}</strong>
                              <small>
                                {formatBytes(item.sizeBytes)}
                                {item.owner?.email ? ` · ${item.owner.email}` : ''}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  : (
                      <div className={styles.empty}>
                        <FolderOpen />
                        <span>{q ? '没有匹配的素材' : '还没有可用素材，可以直接上传第一个。'}</span>
                      </div>
                    )}
            </Modal.Body>
            <Modal.Footer className={styles.footer}>
              <Button type="button" variant="ghost" onPress={modal.close}>取消</Button>
              <Button
                type="button"
                variant="primary"
                isDisabled={!selected || uploadProgress !== null}
                onPress={() => {
                  if (!selected)
                    return
                  onSelect(selected)
                  modal.close()
                }}
              >
                使用所选素材
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

function formatBytes(value: number) {
  if (value < 1024)
    return `${value} B`
  if (value < 1024 * 1024)
    return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function matchesAccept(item: MediaPickerItem, accept?: string) {
  if (!accept)
    return true
  const extension = `.${item.name.split('.').pop()?.toLowerCase() ?? ''}`
  return accept.split(',').some((rule) => {
    const normalized = rule.trim().toLowerCase()
    if (!normalized)
      return false
    if (normalized.startsWith('.'))
      return extension === normalized
    if (normalized.endsWith('/*'))
      return item.mimeType.toLowerCase().startsWith(normalized.slice(0, -1))
    return item.mimeType.toLowerCase() === normalized
  })
}

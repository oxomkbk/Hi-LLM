'use client'

import { Check, CloudArrowUpIn, FileZipper, TriangleExclamation } from '@gravity-ui/icons'
import { Alert, Button, Modal, Spinner, toast } from '@heroui/react'
import { useRef, useState } from 'react'

import { request } from '@/lib/request'
import { uploadPromptPackage } from '@/lib/wonderland/client-upload'

import type { PromptCategory, PromptImport } from '@/types'
import type { UseOverlayStateReturn } from '@heroui/react'

export default function PromptImportModal({ categories, onCommitted, state }: { categories: PromptCategory[], onCommitted: VoidFunction, state: UseOverlayStateReturn }) {
  const [current, setCurrent] = useState<PromptImport | null>(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [primaryCategory, setPrimaryCategory] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parse = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file)
      return toast.danger('请选择 ZIP 标准包')
    setUploading(true)
    try {
      const uploaded = await uploadPromptPackage(file, setProgress)
      const result = await request<PromptImport>('/admin/prompt-imports', { body: JSON.stringify({ fileId: uploaded.fileId }), method: 'POST' })
      setCurrent(result.data)
      const matched = categories.filter(category => result.data.report.metadata?.categories.includes(category.slug)).map(category => category.id)
      const fallback = matched.length ? matched : categories[0] ? [categories[0].id] : []
      setSelectedCategories(fallback)
      const primarySlug = result.data.report.metadata?.primaryCategory
      setPrimaryCategory(categories.find(category => category.slug === primarySlug)?.id ?? fallback[0] ?? '')
    }
    catch {}
    finally { setUploading(false) }
  }

  const commit = async () => {
    if (!current || current.report.blocking.length)
      return
    if (!primaryCategory || !selectedCategories.length)
      return toast.danger('请确认导入分类')
    setCommitting(true)
    try {
      await request(`/admin/prompt-imports/${current.id}/commit`, {
        body: JSON.stringify({ categoryIds: selectedCategories, primaryCategoryId: primaryCategory }),
        method: 'POST',
      })
      toast.success('已创建 Prompt 草稿')
      state.close()
      onCommitted()
    }
    catch {}
    finally { setCommitting(false) }
  }

  return (
    <Modal.Backdrop variant="blur" isDismissable={!uploading && !committing} isKeyboardDismissDisabled={uploading || committing} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container size="lg" placement="center" scroll="inside">
        <Modal.Dialog className="overflow-hidden sm:max-w-4xl">
          <Modal.CloseTrigger aria-label="关闭导入窗口" onPress={state.close} />
          <Modal.Header className="border-b border-border">
            <div>
              <Modal.Heading>导入 Prompts 标准包</Modal.Heading>
              <p className="mt-1 text-xs text-muted">识别文件夹中的提示词、样式、Markdown、README、图片和视频。</p>
            </div>
          </Modal.Header>
          <Modal.Body className="py-5">
            {!current
              ? (
                  <div className="prompt-import-dropzone">
                    <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground"><FileZipper className="size-7" /></span>
                    <div>
                      <h3>选择一个 .zip 包</h3>
                      <p>最大 200MB；根目录需包含 meta.json，推荐使用 prompts/、styles/、preview/、assets/。</p>
                    </div>
                    <input ref={fileRef} type="file" accept=".zip,application/zip" />
                    <Button isPending={uploading} onPress={parse}>
                      {uploading ? <Spinner color="current" size="sm" /> : <CloudArrowUpIn />}
                      {uploading ? `上传并解析 ${progress}%` : '上传并解析'}
                    </Button>
                  </div>
                )
              : (
                  <div className="space-y-5">
                    <Alert status={current.report.blocking.length ? 'danger' : 'success'}>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>{current.report.blocking.length ? '需要修正压缩包' : '解析完成，可以创建草稿'}</Alert.Title>
                        <Alert.Description>
                          {current.report.entryCount}
                          {' '}
                          个文件 · 解压后
                          {' '}
                          {formatBytes(current.report.totalUncompressedBytes)}
                          {' '}
                          ·
                          {' '}
                          {current.report.documents.length}
                          {' '}
                          份文档 ·
                          {' '}
                          {current.report.assets.length}
                          {' '}
                          个资源
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                    {current.report.metadata
                      ? (
                          <div className="rounded-2xl border border-border bg-surface-secondary/40 p-4">
                            <p className="text-xs font-black text-accent">识别结果</p>
                            <h3 className="mt-2 text-lg font-black">{current.report.metadata.title}</h3>
                            <p className="mt-1 text-sm text-muted">{current.report.metadata.summary}</p>
                            <p className="mt-3 font-mono text-xs">
                              /
                              {current.report.metadata.slug}
                              {' '}
                              ·
                              {current.report.metadata.contentKind}
                            </p>
                          </div>
                        )
                      : null}
                    {current.report.blocking.length
                      ? <IssueList title="阻塞问题" icon={<TriangleExclamation />} items={current.report.blocking} tone="danger" />
                      : null}
                    {current.report.warnings.length ? <IssueList title="建议检查" icon={<TriangleExclamation />} items={current.report.warnings} tone="warning" /> : null}
                    {!current.report.blocking.length
                      ? (
                          <section>
                            <h3 className="text-sm font-black">确认导入分类</h3>
                            <p className="mb-3 text-xs text-muted">可多选；圆点表示主分类。meta.json 中不存在的分类可在这里补选。</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {categories.filter(category => category.active).map((category) => {
                                const checked = selectedCategories.includes(category.id)
                                return (
                                  <label key={category.id} className={`prompt-category-option ${checked ? 'is-selected' : ''}`}>
                                    <input type="checkbox" checked={checked} onChange={() => setSelectedCategories(values => checked ? values.filter(value => value !== category.id) : [...values, category.id])} />
                                    <span className="flex-1">
                                      <strong>{category.name}</strong>
                                      <small>
                                        /
                                        {category.slug}
                                      </small>
                                    </span>
                                    {checked ? <input name="importPrimary" type="radio" checked={primaryCategory === category.id} onChange={() => setPrimaryCategory(category.id)} /> : null}
                                  </label>
                                )
                              })}
                            </div>
                          </section>
                        )
                      : null}
                    <details className="rounded-xl border border-border p-3">
                      <summary className="cursor-pointer text-sm font-bold">查看识别文件</summary>
                      <div className="mt-3 grid gap-1 font-mono text-xs text-muted">
                        {[...current.report.documents, ...current.report.assets].map(file => (
                          <span key={file.path}>
                            {file.role.padEnd(16)}
                            {' '}
                            {file.path}
                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
          </Modal.Body>
          <Modal.Footer className="border-t border-border">
            <Button variant="tertiary" isDisabled={uploading || committing} slot="close" onPress={state.close}>取消</Button>
            {current
              ? (
                  <Button isDisabled={Boolean(current.report.blocking.length)} isPending={committing} onPress={commit}>
                    {committing ? <Spinner color="current" size="sm" /> : <Check />}
                    创建草稿
                  </Button>
                )
              : null}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function formatBytes(value: number) {
  if (value < 1024 * 1024)
    return `${Math.ceil(value / 1024)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function IssueList({ icon, items, title, tone }: { icon: React.ReactNode, items: string[], title: string, tone: 'danger' | 'warning' }) {
  return (
    <div className={`prompt-import-issues is-${tone}`}>
      <div className="flex items-center gap-2 font-black">
        {icon}
        {title}
      </div>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}

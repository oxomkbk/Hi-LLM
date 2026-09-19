'use client'

import { ApiRequestError, request } from '../request'

import type { IResponse } from '@/types'

interface UploadSession {
  fileObjectId: string
  id: string
  maxConcurrency: number
  partCount: number
  partSize: number
}

interface UploadStatus {
  fileObjectId: string
  status: 'cancelled' | 'cancelling' | 'completed' | 'creating' | 'expired' | 'failed' | 'uploading' | 'verifying'
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

type ImageUploadScope = 'catalog-icon' | 'community-mcp-icon' | 'community-skill-icon' | 'user-avatar' | 'user-profile-background' | 'wonderland-image' | 'wonderland-work-image'

type UploadScope = ImageUploadScope | 'community-prompt-asset' | 'prompt-asset' | 'prompt-package'

class UploadCompletionFailure extends Error {
  constructor(readonly cause: unknown, readonly canCancel: boolean) {
    super(cause instanceof Error ? cause.message : '上传完成确认失败')
  }
}

export async function uploadAccountAvatar(file: File, onProgress?: (percent: number) => void) {
  return uploadImage(file, { maxBytes: 2 * 1024 * 1024, scope: 'user-avatar' }, onProgress)
}

export async function uploadCatalogIcon(file: File, onProgress?: (percent: number) => void) {
  return uploadImage(file, { maxBytes: 2 * 1024 * 1024, scope: 'catalog-icon' }, onProgress)
}

export async function uploadCommunityCatalogIcon(file: File, kind: 'mcp' | 'skill', onProgress?: (percent: number) => void) {
  return uploadImage(file, {
    maxBytes: 2 * 1024 * 1024,
    scope: kind === 'skill' ? 'community-skill-icon' : 'community-mcp-icon',
  }, onProgress)
}

export async function uploadCommunityPromptAsset(file: File, onProgress?: (percent: number) => void) {
  if (file.size <= 0 || file.size > 100 * 1024 * 1024)
    throw new Error('单个资源不能超过 100MB')
  return uploadMultipartFile(file, 'community-prompt-asset', onProgress)
}

export async function uploadProfileBackground(file: File, onProgress?: (percent: number) => void) {
  return uploadImage(file, { maxBytes: MAX_IMAGE_BYTES, scope: 'user-profile-background' }, onProgress)
}

export async function uploadPromptAsset(file: File, onProgress?: (percent: number) => void) {
  if (file.size <= 0 || file.size > 200 * 1024 * 1024)
    throw new Error('单个资源不能超过 200MB')
  return uploadMultipartFile(file, 'prompt-asset', onProgress)
}

export async function uploadPromptPackage(file: File, onProgress?: (percent: number) => void) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'zip')
    throw new Error('请选择 ZIP 格式的 Prompts 标准包')
  if (file.size <= 0 || file.size > 200 * 1024 * 1024)
    throw new Error('Prompts 标准包不能超过 200MB')
  return uploadMultipartFile(file, 'prompt-package', onProgress)
}

export async function uploadWonderlandImage(file: File, onProgress?: (percent: number) => void) {
  return uploadImage(file, { maxBytes: MAX_IMAGE_BYTES, scope: 'wonderland-image' }, onProgress)
}

export async function uploadWonderlandWorkImage(file: File, onProgress?: (percent: number) => void) {
  return uploadImage(file, { maxBytes: MAX_IMAGE_BYTES, scope: 'wonderland-work-image' }, onProgress)
}

async function completeWithReconciliation(session: UploadSession) {
  try {
    await request(`/uploads/${session.id}/complete`, { method: 'POST' })
  }
  catch (error) {
    if (error instanceof ApiRequestError && !error.retryable)
      throw new UploadCompletionFailure(error, false)

    let lastError: unknown = error
    let lastStatus: UploadStatus['status'] | null = null
    for (const delay of [200, 400, 800]) {
      await wait(delay)
      let status: UploadStatus
      try {
        status = (await request<UploadStatus>(`/uploads/${session.id}`)).data
      }
      catch (statusError) {
        lastError = statusError
        continue
      }
      lastStatus = status.status
      if (status.status === 'completed')
        return
      if (status.status === 'verifying') {
        try {
          await request(`/uploads/${session.id}/complete`, { method: 'POST' })
          return
        }
        catch (retryError) {
          lastError = retryError
          if (retryError instanceof ApiRequestError && !retryError.retryable)
            throw new UploadCompletionFailure(retryError, false)
        }
      }
      if (status.status === 'cancelled' || status.status === 'expired' || status.status === 'failed')
        throw new UploadCompletionFailure(lastError, false)
    }
    throw new UploadCompletionFailure(lastError, lastStatus === 'uploading')
  }
}

async function uploadImage(
  file: File,
  options: { maxBytes: number, scope: ImageUploadScope },
  onProgress?: (percent: number) => void,
) {
  if (!ALLOWED_TYPES.has(file.type))
    throw new Error('只支持 PNG、JPG 和 WebP 图片')
  if (file.size <= 0 || file.size > options.maxBytes)
    throw new Error(`单张图片不能超过 ${Math.floor(options.maxBytes / 1024 / 1024)}MB`)

  return uploadMultipartFile(file, options.scope, onProgress)
}

async function uploadMultipartFile(
  file: File,
  scope: UploadScope,
  onProgress?: (percent: number) => void,
) {
  const created = await request<UploadSession>('/uploads', {
    body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', scope, size: file.size }),
    method: 'POST',
  })
  const session = created.data
  let uploadedParts = 0

  let completionStarted = false
  try {
    for (let offset = 0; offset < session.partCount; offset += session.maxConcurrency) {
      const batch = Array.from(
        { length: Math.min(session.maxConcurrency, session.partCount - offset) },
        (_, index) => offset + index + 1,
      )
      await Promise.all(batch.map(async (partNumber) => {
        const start = (partNumber - 1) * session.partSize
        const body = file.slice(start, Math.min(start + session.partSize, file.size), file.type)
        const response = await fetch(`/api/uploads/${session.id}/parts/${partNumber}`, {
          body,
          credentials: 'same-origin',
          method: 'PUT',
        })
        if (!response.ok) {
          const result = await response.json().catch(() => null) as IResponse | null
          throw new ApiRequestError(
            result?.msg || `第 ${partNumber} 个分片上传失败`,
            response.status,
            result?.error?.code,
            result?.error?.retryable,
          )
        }
        uploadedParts += 1
        onProgress?.(Math.round(uploadedParts / session.partCount * 90))
      }))
    }
    completionStarted = true
    await completeWithReconciliation(session)
    onProgress?.(100)
    return { fileId: session.fileObjectId, name: file.name }
  }
  catch (error) {
    const completionFailure = error instanceof UploadCompletionFailure ? error : null
    if (!completionStarted || completionFailure?.canCancel)
      await request(`/uploads/${session.id}`, { method: 'DELETE' }).catch(() => undefined)
    throw completionFailure?.cause ?? error
  }
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

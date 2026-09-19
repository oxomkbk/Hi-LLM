import path from 'node:path'

import { StorageInputError } from './types'

const SAFE_UPLOAD_ID = /^[\w-]{8,256}$/

export function assertObjectKey(key: string) {
  if (!key || key.length > 1024 || key.includes('\\') || key.includes('\0') || key.startsWith('/'))
    throw new StorageInputError('对象键格式无效')
  const normalized = path.posix.normalize(key)
  if (normalized !== key || normalized === '..' || normalized.startsWith('../'))
    throw new StorageInputError('对象键格式无效')
  return key
}

export function assertPartNumber(partNumber: number) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000)
    throw new StorageInputError('分片编号无效')
  return partNumber
}

export function assertUploadId(uploadId: string) {
  if (!SAFE_UPLOAD_ID.test(uploadId))
    throw new StorageInputError('上传任务编号无效')
  return uploadId
}

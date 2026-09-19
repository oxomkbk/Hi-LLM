import { StorageProviderResponseError } from '../storage/types'

import type { StoragePart } from '../storage/types'

export interface UploadPartsExpectation {
  partCount: number
  partSize: number
  totalSize: number
}

export class UploadPartsValidationError extends Error {
  readonly status = 409

  constructor(
    message: string,
    readonly code: 'UPLOAD_PARTS_INCOMPLETE' | 'UPLOAD_PARTS_INVALID' | 'UPLOAD_PART_LENGTH_MISMATCH',
    readonly retryable = false,
  ) {
    super(message)
  }
}

export async function listCompleteParts(input: {
  expectation: UploadPartsExpectation
  list: () => Promise<StoragePart[]>
  retryDelays?: readonly number[]
  sleep?: (milliseconds: number) => Promise<void>
}) {
  const retryDelays = input.retryDelays ?? [0, 150, 350]
  const sleep = input.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  let lastError: unknown

  for (const [index, delay] of retryDelays.entries()) {
    if (delay > 0)
      await sleep(delay)
    try {
      return validateCompleteParts(input.expectation, await input.list())
    }
    catch (error) {
      lastError = error
      const canRetry = error instanceof UploadPartsValidationError
        && error.code === 'UPLOAD_PARTS_INCOMPLETE'
        && error.retryable
      if (!canRetry || index === retryDelays.length - 1)
        throw error
    }
  }

  throw lastError
}

export function validateCompleteParts(expectation: UploadPartsExpectation, parts: StoragePart[]) {
  assertExpectation(expectation)
  const indexed = new Map<number, StoragePart>()

  for (const part of parts) {
    if (!Number.isSafeInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > expectation.partCount) {
      throw new UploadPartsValidationError('存储服务返回了越界的分片编号', 'UPLOAD_PARTS_INVALID')
    }
    if (!Number.isSafeInteger(part.size) || part.size <= 0)
      throw new StorageProviderResponseError('存储服务返回了无效的分片长度')
    if (indexed.has(part.partNumber))
      throw new UploadPartsValidationError('存储服务返回了重复的分片编号', 'UPLOAD_PARTS_INVALID')
    indexed.set(part.partNumber, part)
  }

  if (indexed.size < expectation.partCount) {
    throw new UploadPartsValidationError('仍有分片尚未上传', 'UPLOAD_PARTS_INCOMPLETE', true)
  }
  if (indexed.size > expectation.partCount)
    throw new UploadPartsValidationError('存储服务返回了多余的分片', 'UPLOAD_PARTS_INVALID')

  const normalized: StoragePart[] = []
  for (let partNumber = 1; partNumber <= expectation.partCount; partNumber += 1) {
    const part = indexed.get(partNumber)
    if (!part)
      throw new UploadPartsValidationError(`分片 ${partNumber} 暂未可见`, 'UPLOAD_PARTS_INCOMPLETE', true)
    const expectedLength = partNumber === expectation.partCount
      ? expectation.totalSize - expectation.partSize * (partNumber - 1)
      : expectation.partSize
    if (part.size !== expectedLength) {
      throw new UploadPartsValidationError(
        `分片 ${partNumber} 长度应为 ${expectedLength} 字节，实际为 ${part.size} 字节`,
        'UPLOAD_PART_LENGTH_MISMATCH',
      )
    }
    normalized.push(part)
  }
  return normalized
}

function assertExpectation(expectation: UploadPartsExpectation) {
  if (
    !Number.isSafeInteger(expectation.partCount)
    || expectation.partCount <= 0
    || !Number.isSafeInteger(expectation.partSize)
    || expectation.partSize <= 0
    || !Number.isSafeInteger(expectation.totalSize)
    || expectation.totalSize <= 0
  ) {
    throw new UploadPartsValidationError('上传分片参数无效', 'UPLOAD_PARTS_INVALID')
  }
}

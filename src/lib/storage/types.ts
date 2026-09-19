import type { Readable } from 'node:stream'

export interface StoragePart {
  etag: string
  partNumber: number
  size: number
}

export interface StorageProvider {
  abortMultipartUpload: (input: { key: string, uploadId: string }) => Promise<void>
  completeMultipartUpload: (input: {
    key: string
    parts: StoragePart[]
    uploadId: string
  }) => Promise<StoredObjectInfo>
  createMultipartUpload: (input: { contentType: string, key: string }) => Promise<{ uploadId: string }>
  createReadStream: (input: { end?: number, key: string, start?: number }) => Promise<Readable>
  createReadUrl: (input: { expiresInSeconds: number, key: string }) => Promise<string | null>
  deleteObject: (key: string) => Promise<void>
  headObject: (key: string) => Promise<StoredObjectInfo>
  healthCheck: () => Promise<void>
  listParts: (input: { key: string, uploadId: string }) => Promise<StoragePart[]>
  putObject: (input: {
    body: Readable
    contentLength: number
    contentType: string
    key: string
  }) => Promise<StoredObjectInfo>
  uploadPart: (input: {
    body: Readable
    contentLength: number
    key: string
    partNumber: number
    uploadId: string
  }) => Promise<StoragePart>
}

export interface StoredObjectInfo {
  contentType?: string
  etag?: string
  lastModified?: Date
  sha256?: string
  size: number
}

export class StorageInputError extends Error {
  readonly code = 'STORAGE_INPUT_INVALID'
  readonly status = 400
}

export class StorageNotFoundError extends Error {
  readonly code = 'STORAGE_OBJECT_NOT_FOUND'
  readonly status = 404
}

export class StorageProviderResponseError extends Error {
  readonly code = 'STORAGE_PROVIDER_RESPONSE_INVALID'
  readonly retryable = false
  readonly status = 502
}

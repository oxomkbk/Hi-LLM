import type { PromptContentKind } from '@/types'

export const PROMPT_SUBMISSION_DRAFT_KEY_PREFIX = 'hillm-nav:prompt-submission:v2:'
export const PROMPT_SUBMISSION_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1_000

export interface PromptSubmissionDraft {
  assetKeys: Record<string, string>
  documents: PromptSubmissionDraftDocuments
  expiresAt: number
  kind: PromptContentKind
  metadata: PromptSubmissionDraftMetadata
  pendingAssetNames: string[]
  primaryCategoryId: string
  savedAt: number
  submissionId: string
  submissionKey: string
  uploadedAssets: Record<string, PromptSubmissionUploadedAsset>
  version: 2
}

export interface PromptSubmissionDraftDocuments {
  prompt: string
  promptPath: string
  readme: string
  readmePath: string
  style: string
  stylePath: string
}

export interface PromptSubmissionDraftMetadata {
  compatibility: string
  summary: string
  tags: string
  title: string
}

export interface PromptSubmissionUploadedAsset {
  assetId: string
  isPrimary: boolean
  role: string
}

export function legacyPromptSubmissionDraftKey(userId: string) {
  return `better-nav:prompt-submission:v2:${encodeURIComponent(userId)}`
}

export function promptSubmissionDraftKey(userId: string) {
  return `${PROMPT_SUBMISSION_DRAFT_KEY_PREFIX}${encodeURIComponent(userId)}`
}

export function readPromptSubmissionDraft(raw: string | null, now = Date.now()): PromptSubmissionDraft | null {
  if (!raw)
    return null
  let value: Partial<PromptSubmissionDraft>
  try {
    value = JSON.parse(raw) as Partial<PromptSubmissionDraft>
  }
  catch {
    return null
  }
  if (value.version !== 2 || typeof value.expiresAt !== 'number' || value.expiresAt <= now)
    return null
  if (!isContentKind(value.kind) || !isRecord(value.metadata) || !isRecord(value.documents))
    return null

  return {
    assetKeys: readUuidMap(value.assetKeys),
    documents: {
      prompt: readString(value.documents.prompt),
      promptPath: readString(value.documents.promptPath) || 'prompts/prompt.md',
      readme: readString(value.documents.readme),
      readmePath: readString(value.documents.readmePath) || 'README.md',
      style: readString(value.documents.style),
      stylePath: readString(value.documents.stylePath) || 'styles/style.css',
    },
    expiresAt: value.expiresAt,
    kind: value.kind,
    metadata: {
      compatibility: readString(value.metadata.compatibility),
      summary: readString(value.metadata.summary),
      tags: readString(value.metadata.tags),
      title: readString(value.metadata.title),
    },
    pendingAssetNames: Array.isArray(value.pendingAssetNames)
      ? value.pendingAssetNames.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : [],
    primaryCategoryId: readString(value.primaryCategoryId),
    savedAt: typeof value.savedAt === 'number' ? value.savedAt : now,
    submissionId: readOptionalUuid(value.submissionId),
    submissionKey: readOptionalUuid(value.submissionKey),
    uploadedAssets: readUploadedAssets(value.uploadedAssets),
    version: 2,
  }
}

export function reconcilePromptSubmissionUploadedAssets(
  current: Record<string, PromptSubmissionUploadedAsset>,
  serverAssetIds: Iterable<string>,
) {
  const validIds = new Set(serverAssetIds)
  return Object.fromEntries(Object.entries(current).filter(([, asset]) => validIds.has(asset.assetId)))
}

export function writePromptSubmissionDraft(storage: Storage, storageKey: string, value: Omit<PromptSubmissionDraft, 'expiresAt' | 'savedAt' | 'version'>, now = Date.now()) {
  const draft: PromptSubmissionDraft = {
    ...value,
    expiresAt: now + PROMPT_SUBMISSION_DRAFT_TTL_MS,
    savedAt: now,
    version: 2,
  }
  storage.setItem(storageKey, JSON.stringify(draft))
  return draft
}

function isContentKind(value: unknown): value is PromptContentKind {
  return value === 'adaptation' || value === 'image' || value === 'video' || value === 'web_ui'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readOptionalUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : ''
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readUploadedAssets(value: unknown) {
  if (!isRecord(value))
    return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (!isRecord(item) || typeof item.assetId !== 'string' || typeof item.role !== 'string')
      return []
    return [[key, { assetId: item.assetId, isPrimary: item.isPrimary === true, role: item.role } satisfies PromptSubmissionUploadedAsset]]
  }))
}

function readUuidMap(value: unknown) {
  if (!isRecord(value))
    return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const uuid = readOptionalUuid(item)
    return uuid ? [[key, uuid]] : []
  }))
}

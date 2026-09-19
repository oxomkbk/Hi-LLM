import { inspectMarkdownImages, sanitizeMarkdownForRichEditor } from '../content/markdown'
import { normalizeWonderlandDocument } from '../wonderland/content'

import type { WonderlandDocument } from '../wonderland/content'

export type WonderlandDraftKind = 'answer' | 'comment' | 'question' | 'work'

export interface WonderlandGuestDraft {
  body: WonderlandDocument | string
  categoryId?: string
  coverFileId?: string
  demoUrl?: string
  kind: WonderlandDraftKind
  parentId?: string | null
  sourceUrl?: string
  summary?: string
  tags?: string[]
  targetId: string
  title?: string
  workKind?: string
}

const VERSION = 1
const TTL_MS = 24 * 60 * 60 * 1_000
const MAX_BYTES = 64 * 1024
const KEY_PREFIX = 'hillm-nav:wonderland-draft:v1:'
const LEGACY_KEY_PREFIX = 'better-nav:wonderland-draft:v1:'

export function clearWonderlandDraft(kind: WonderlandDraftKind, targetId: string, parentId?: string | null) {
  if (typeof window === 'undefined')
    return false
  removeStoredDraft(draftKey(kind, targetId, parentId, LEGACY_KEY_PREFIX))
  return removeStoredDraft(draftKey(kind, targetId, parentId))
}

export function loadWonderlandDraft(kind: WonderlandDraftKind, targetId: string, parentId?: string | null) {
  if (typeof window === 'undefined')
    return null
  const key = draftKey(kind, targetId, parentId)
  const legacyKey = draftKey(kind, targetId, parentId, LEGACY_KEY_PREFIX)
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey)
  }
  catch {
    return null
  }
  if (!raw)
    return null
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
    removeStoredDraft(key)
    return null
  }
  try {
    const parsed = JSON.parse(raw) as WonderlandGuestDraft & { expiresAt?: number, version?: number }
    if (parsed.version !== VERSION || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      removeStoredDraft(key)
      return null
    }
    const normalized = normalizeDraft(parsed)
    if (!normalized || normalized.kind !== kind || normalized.targetId !== targetId || (normalized.parentId ?? null) !== (parentId ?? null)) {
      removeStoredDraft(key)
      return null
    }
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, raw)
      window.localStorage.removeItem(legacyKey)
    }
    return normalized
  }
  catch {
    removeStoredDraft(key)
    return null
  }
}

export function saveWonderlandDraft(input: WonderlandGuestDraft) {
  if (typeof window === 'undefined')
    return false
  const draft = normalizeDraft(input)
  if (!draft)
    return false
  const now = Date.now()
  const serialized = JSON.stringify({ ...draft, expiresAt: now + TTL_MS, savedAt: now, version: VERSION })
  if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES)
    return false
  try {
    window.localStorage.setItem(draftKey(draft.kind, draft.targetId, draft.parentId), serialized)
    return true
  }
  catch {
    return false
  }
}

function cleanString(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function draftKey(kind: WonderlandDraftKind, targetId: string, parentId?: string | null, prefix = KEY_PREFIX) {
  return `${prefix}${kind}:${encodeURIComponent(targetId)}:${encodeURIComponent(parentId ?? 'root')}`
}

function normalizeDraft(input: WonderlandGuestDraft): WonderlandGuestDraft | null {
  if (!['answer', 'comment', 'question', 'work'].includes(input.kind) || typeof input.targetId !== 'string' || !input.targetId || input.targetId.length > 100)
    return null
  const parentId = typeof input.parentId === 'string' && input.parentId.length <= 100 ? input.parentId : null
  if (input.kind === 'comment') {
    if (typeof input.body !== 'string')
      return null
    const sanitized = sanitizeMarkdownForRichEditor(input.body).markdown.slice(0, 2_000)
    if (inspectMarkdownImages(sanitized).fileIds.length)
      return null
    return { body: sanitized, kind: 'comment', parentId, targetId: input.targetId }
  }
  try {
    const content = normalizeWonderlandDocument(input.body, {
      maxImages: 8,
      maxTextLength: 30_000,
      minTextLength: 0,
    }).document
    if (input.kind === 'answer')
      return { body: content, kind: 'answer', targetId: input.targetId }
    if (input.kind === 'work') {
      return {
        body: content,
        coverFileId: cleanString(input.coverFileId, 36),
        demoUrl: cleanString(input.demoUrl, 2_048),
        kind: 'work',
        sourceUrl: cleanString(input.sourceUrl, 2_048),
        summary: cleanString(input.summary, 240),
        tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) : [],
        targetId: input.targetId,
        title: cleanString(input.title, 100),
        workKind: cleanString(input.workKind, 20),
      }
    }
    return {
      body: content,
      categoryId: cleanString(input.categoryId, 36),
      kind: 'question',
      summary: cleanString(input.summary, 300),
      tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 5) : [],
      targetId: input.targetId,
      title: cleanString(input.title, 160),
    }
  }
  catch {
    return null
  }
}

function removeStoredDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
    return true
  }
  catch {
    return false
  }
}

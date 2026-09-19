import { normalizeSecurityPath, sha256Canonical } from './canonical-json'
import { AiSecurityError } from './errors'

import type { SecuritySubjectType } from './domain'

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/

export interface AcquiredSecurityFile {
  path: string
  sha256: string
}

export interface InputFingerprintSource {
  declaredFingerprint: string
  files: readonly AcquiredSecurityFile[]
  sourceRevision: string | null
}

export interface ScannerConfigFingerprintInput {
  adapterId: string
  adapterParameters: Readonly<Record<string, unknown>>
  allowedExtensions: readonly string[]
  allowedMimeTypes: readonly string[]
  chunkingPolicy: string
  coverageSchemaVersion: string
  limits: {
    maxArchiveDepth: number
    maxFileBytes: number
    maxFiles: number
    maxTextBytes: number
  }
  llm: null | {
    identityFingerprint: string
    outputSchemaVersion: string
    promptVersion: string
  }
  normalizerVersion: string
  rulesVersion: string
  scannerName: string
  scannerVersion: string
  scoringVersion: string
  severityMapping: Readonly<Record<string, string>>
  sourcePolicyVersion: string
  truncationPolicy: string
}

export function createDeclaredFingerprint(subjectType: SecuritySubjectType, payload: unknown) {
  return sha256Canonical({
    payload,
    schema: 'declared-v1',
    subjectType,
  })
}

export function createInputFingerprint(input: InputFingerprintSource) {
  assertFingerprint(input.declaredFingerprint)
  const files = input.files.map(file => ({
    path: normalizeSecurityPath(file.path),
    sha256: assertFingerprint(file.sha256),
  })).sort((left, right) => left.path.localeCompare(right.path))

  for (let index = 1; index < files.length; index++) {
    if (files[index]?.path === files[index - 1]?.path)
      throw new AiSecurityError('SECURITY_INVALID_FINGERPRINT', `Duplicate input path: ${files[index]?.path}`)
  }

  return sha256Canonical({
    declaredFingerprint: input.declaredFingerprint,
    files,
    schema: 'input-v1',
    sourceRevision: input.sourceRevision?.normalize('NFC') ?? null,
  })
}

export function createScannerConfigFingerprint(input: ScannerConfigFingerprintInput) {
  if (input.llm)
    assertFingerprint(input.llm.identityFingerprint)

  return sha256Canonical({
    ...input,
    allowedExtensions: normalizeSet(input.allowedExtensions),
    allowedMimeTypes: normalizeSet(input.allowedMimeTypes),
    schema: 'scanner-config-v1',
  })
}

function assertFingerprint(value: string) {
  if (!FINGERPRINT_PATTERN.test(value))
    throw new AiSecurityError('SECURITY_INVALID_FINGERPRINT', 'Expected a lowercase SHA-256 fingerprint')
  return value
}

function normalizeSet(values: readonly string[]) {
  return [...new Set(values.map(value => value.normalize('NFC').trim().toLowerCase()))].sort()
}

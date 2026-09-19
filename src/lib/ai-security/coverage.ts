import { AiSecurityError } from './errors'

import type {
  SecurityCoverage,
  SecurityCoverageLevel,
  SecurityCoveragePartition,
  SecurityCoverageSkippedItem,
} from './domain'

export interface SecurityCoverageInput {
  included: readonly string[]
  level: SecurityCoverageLevel
  partitions: Readonly<Record<string, SecurityCoveragePartition>>
  skipped: readonly SecurityCoverageSkippedItem[]
  sourceRevision?: string | null
}

const LABELS = {
  complete: '完整静态评测',
  config_only: '仅配置评测',
  partial: '部分静态评测',
} as const

const PARTITION_STATUSES = new Set(['complete', 'partial', 'config_only', 'metadata_only', 'not_applicable'])

export function normalizeCoverage(input: SecurityCoverageInput): SecurityCoverage {
  const included = normalizeUniqueReferences(input.included)
  const skipped = input.skipped.map(item => ({
    reason: normalizeReference(item.reason, 'skip reason'),
    ref: normalizeReference(item.ref, 'skipped reference'),
  })).sort((left, right) => left.ref.localeCompare(right.ref) || left.reason.localeCompare(right.reason))

  if (input.level === 'complete' && skipped.length > 0)
    invalidCoverage('Complete coverage cannot contain skipped inputs')
  if ((input.level === 'partial' || input.level === 'config_only') && skipped.length === 0)
    invalidCoverage(`${input.level} coverage must enumerate skipped inputs`)
  if (input.level === 'config_only' && included.length === 0)
    invalidCoverage('Config-only coverage must enumerate included configuration')

  const partitions: Record<string, SecurityCoveragePartition> = {}
  for (const [rawName, partition] of Object.entries(input.partitions).sort(([left], [right]) => left.localeCompare(right))) {
    const name = normalizeReference(rawName, 'partition name')
    if (!PARTITION_STATUSES.has(partition.status))
      invalidCoverage(`Unknown partition status: ${partition.status}`)
    if (!Number.isSafeInteger(partition.includedCount) || partition.includedCount < 0)
      invalidCoverage(`Invalid included count for ${name}`)
    if (!Number.isSafeInteger(partition.skippedCount) || partition.skippedCount < 0)
      invalidCoverage(`Invalid skipped count for ${name}`)
    partitions[name] = { ...partition }
  }

  return {
    included,
    label: LABELS[input.level],
    level: input.level,
    partitions,
    skipped,
    sourceRevision: input.sourceRevision?.normalize('NFC').trim() || null,
  }
}

function hasControlCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 31 || codePoint === 127
}

function invalidCoverage(message: string): never {
  throw new AiSecurityError('SECURITY_COVERAGE_INVALID', message)
}

function normalizeReference(value: string, label: string) {
  const normalized = value.normalize('NFC').trim()
  if (!normalized || normalized.length > 1000 || [...normalized].some(hasControlCharacter))
    invalidCoverage(`Invalid ${label}`)
  return normalized
}

function normalizeUniqueReferences(values: readonly string[]) {
  return [...new Set(values.map(value => normalizeReference(value, 'included reference')))].sort()
}

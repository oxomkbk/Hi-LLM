import { Buffer } from 'node:buffer'

import { normalizeSecurityPath, sha256Canonical } from '../canonical-json'
import { AiSecurityError } from '../errors'
import { redactSecurityText } from '../redaction'

import type { SecuritySeverity } from '../domain'
import type { NormalizedSecurityFinding } from '../finalize'

const MAX_REPORT_BYTES = 4 * 1024 * 1024
const MAX_RESULTS = 500
const PINNED_SCANNER_NAME = 'aig-skill-scan'
const PINNED_SCANNER_VERSION = '0.2.1'
const RISK_CODES = new Set(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09'])

type UnknownRecord = Record<string, unknown>

export function parseAndNormalizeSkillSarif(serialized: string, acquiredManifestPaths: ReadonlySet<string>) {
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REPORT_BYTES)
    invalidReport('SARIF report exceeds the maximum size')
  let document: unknown
  try {
    document = JSON.parse(serialized)
  }
  catch {
    invalidReport('SARIF report is not valid JSON')
  }
  const report = record(document, 'SARIF document')
  if (report.version !== '2.1.0')
    invalidReport('SARIF version must be 2.1.0')
  const runs = array(report.runs, 'SARIF runs')
  if (runs.length !== 1)
    invalidReport('SARIF report must contain exactly one run')
  const run = record(runs[0], 'SARIF run')
  const driver = record(record(run.tool, 'SARIF tool').driver, 'SARIF driver')
  if (driver.name !== PINNED_SCANNER_NAME || driver.version !== PINNED_SCANNER_VERSION)
    invalidReport('SARIF scanner identity differs from the pinned version')

  const manifest = new Set([...acquiredManifestPaths].map((path) => {
    try {
      return normalizeSecurityPath(path)
    }
    catch {
      return invalidReport('Acquired manifest contains an invalid path')
    }
  }))
  const rawResults = array(run.results, 'SARIF results')
  if (rawResults.length > MAX_RESULTS)
    invalidReport('SARIF report contains too many findings')
  const findings = rawResults.map((result, index) => normalizeFinding(result, index, manifest))
  const runProperties = optionalRecord(run.properties)
  const engineScore = normalizeEngineScore(runProperties?.securityScore)
  return {
    engineScore,
    findings,
    rulesVersion: 'skilltrustbench-t01-t09@v4.5.0',
    scannerName: PINNED_SCANNER_NAME,
    scannerVersion: PINNED_SCANNER_VERSION,
  }
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value))
    invalidReport(`${label} must be an array`)
  return value
}

function findingFingerprint(finding: Omit<NormalizedSecurityFinding, 'fingerprint'>) {
  return sha256Canonical({
    artifactPath: finding.artifactPath ?? null,
    description: finding.description,
    endLine: finding.endLine ?? null,
    riskCode: finding.riskCode,
    schema: 'normalized-skill-finding-v1',
    severity: finding.severity,
    startLine: finding.startLine ?? null,
    title: finding.title,
  })
}

function invalidReport(message: string): never {
  throw new AiSecurityError('SECURITY_REPORT_INVALID', message)
}

function normalizeArtifactPath(result: UnknownRecord, manifest: ReadonlySet<string>) {
  const locations = array(result.locations, 'SARIF locations')
  if (locations.length !== 1)
    invalidReport('Each SARIF result must contain exactly one location')
  const physical = record(record(locations[0], 'SARIF location').physicalLocation, 'SARIF physical location')
  const artifact = record(physical.artifactLocation, 'SARIF artifact location')
  const uri = requiredText(artifact.uri, 1000, 'SARIF artifact URI')
  if (uri === '.')
    return { endLine: null, path: null, startLine: null }
  let path: string
  try {
    path = normalizeSecurityPath(uri)
  }
  catch {
    invalidReport('SARIF artifact path is unsafe')
  }
  if (!manifest.has(path))
    invalidReport('SARIF artifact path is outside the acquired manifest')
  const region = optionalRecord(physical.region)
  const startLine = optionalLine(region?.startLine, 'startLine')
  const endLine = optionalLine(region?.endLine, 'endLine')
  if (endLine !== null && (startLine === null || endLine < startLine))
    invalidReport('SARIF line range is invalid')
  return { endLine, path, startLine }
}

function normalizedReportText(value: unknown, maximum: number, label: string) {
  return redactSecurityText(requiredText(value, maximum, label))
}

function normalizeEngineScore(value: unknown) {
  if (value === undefined || value === null)
    return null
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100)
    invalidReport('SARIF engine score is invalid')
  return Number(value)
}

function normalizeFinding(value: unknown, index: number, manifest: ReadonlySet<string>): NormalizedSecurityFinding {
  const result = record(value, `SARIF result ${index}`)
  const riskCode = requiredText(result.ruleId, 20, 'SARIF rule ID').toUpperCase()
  if (!RISK_CODES.has(riskCode))
    invalidReport(`SARIF rule ID is not allowed: ${riskCode}`)
  const message = record(result.message, 'SARIF message')
  const properties = optionalRecord(result.properties)
  const title = normalizedReportText(message.text, 200, 'SARIF finding title')
  const description = properties?.description === undefined
    ? title
    : normalizedReportText(properties.description, 4000, 'SARIF finding description')
  const recommendation = normalizeRecommendation(result.fixes)
  const location = normalizeArtifactPath(result, manifest)
  const normalized = {
    artifactPath: location.path,
    description,
    endLine: location.endLine,
    evidenceRedacted: null,
    publicSummary: null,
    publicVisible: false,
    recommendation,
    riskCode,
    severity: normalizeSeverity(properties?.severity, result.level),
    startLine: location.startLine,
    title,
  }
  return { ...normalized, fingerprint: findingFingerprint(normalized) }
}

function normalizeRecommendation(value: unknown) {
  if (value === undefined || value === null)
    return null
  const fixes = array(value, 'SARIF fixes')
  if (fixes.length === 0)
    return null
  if (fixes.length > 1)
    invalidReport('SARIF result contains too many fixes')
  const description = record(record(fixes[0], 'SARIF fix').description, 'SARIF fix description')
  return normalizedReportText(description.text, 4000, 'SARIF recommendation')
}

function normalizeSeverity(value: unknown, level: unknown): SecuritySeverity {
  const normalized = typeof value === 'string' ? value.normalize('NFC').trim().toLowerCase() : ''
  const mapped = new Map<string, SecuritySeverity>([
    ['critical', 'critical'],
    ['high', 'high'],
    ['info', 'info'],
    ['informational', 'info'],
    ['low', 'low'],
    ['medium', 'medium'],
    ['严重', 'critical'],
    ['中危', 'medium'],
    ['低危', 'low'],
    ['高危', 'high'],
  ]).get(normalized)
  if (mapped)
    return mapped
  if (level === 'error')
    return 'high'
  if (level === 'warning')
    return 'medium'
  if (level === 'note')
    return 'low'
  invalidReport('SARIF finding severity is invalid')
}

function optionalLine(value: unknown, label: string) {
  if (value === undefined || value === null)
    return null
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    invalidReport(`SARIF ${label} is invalid`)
  return Number(value)
}

function optionalRecord(value: unknown) {
  if (value === undefined || value === null)
    return null
  return record(value, 'SARIF object')
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidReport(`${label} must be an object`)
  return value as UnknownRecord
}

function requiredText(value: unknown, maximum: number, label: string) {
  if (typeof value !== 'string')
    invalidReport(`${label} must be text`)
  const normalized = value.normalize('NFC').trim()
  const hasControlCharacter = [...normalized].some((character) => {
    const point = character.codePointAt(0) ?? 0
    return point !== 9 && point !== 10 && point !== 13 && (point <= 31 || point === 127)
  })
  if (!normalized || normalized.length > maximum || hasControlCharacter)
    invalidReport(`${label} is invalid`)
  return normalized
}

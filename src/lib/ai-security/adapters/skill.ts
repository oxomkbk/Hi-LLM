import 'server-only'

import { Buffer } from 'node:buffer'

import { getBusinessPool } from '@/lib/db/business'
import { completeSmallFileUpload, deleteFileObject, storeSmallFile } from '@/lib/files/service'
import { getLlmRuntimeConfig } from '@/lib/llm/settings'

import { createStoredZip, prepareSkillSourceArchive } from '../acquisition/archive'
import { resolveAndDownloadGitSource } from '../acquisition/git-provider'
import { selectPriorityRepositoryMaterial } from '../acquisition/priority-material'
import { parseProviderUrl } from '../acquisition/provider-url'
import { shouldUsePlatformFallbackForSourceError } from '../acquisition/source-fallback'
import { AiSecurityError } from '../errors'
import { createInputFingerprint } from '../fingerprints'
import { parseAndNormalizeSkillSarif } from '../normalizers/sarif'
import { redactSecurityText } from '../redaction'
import { securityRiskRequiresAction } from '../risk-disposition'
import { scanSkillArchive, SecurityScannerClientError } from '../runner/client'
import { isSecurityWorkerLocalOnly, shouldUseSecurityLlm } from '../runtime-mode'
import { loadSecuritySubjectSnapshot } from '../subject-repository'
import { evaluateTrustedContent } from '../trust-evaluation'
import {
  analyzeSkillFiles,
  buildPlatformSkillCoverage,
  buildPlatformSkillFile,
} from './skill-analysis'
import { isLocalDeterministicAssessment } from './types'

import type { AcquiredSourceFile } from '../acquisition/manifest'
import type { SecurityCoverageInput } from '../coverage'
import type { SecuritySubjectType } from '../domain'
import type { PlatformSkillPayload } from './skill-analysis'
import type { SecurityAssessmentAdapter } from './types'

export const SKILL_SECURITY_ADAPTER_VERSION = {
  adapter: 'skill-priority-material-v3',
  normalizer: 'skill-sarif-v1',
  rules: 'skilltrustbench-t01-t09+priority-material+document-evidence-v6-scoped-credentials',
  scanner: 'aig-skill-scan@0.2.1',
} as const

interface AcquiredSkillMaterial {
  archive: Uint8Array
  fileCount: number
  files: AcquiredSourceFile[]
  mode: 'platform' | 'repository'
  paths: Set<string>
  sourceUnavailable: boolean
  sourceRevision: string | null
  totalBytes: number
  totalFileCount: number
  truncatedPaths: string[]
}

interface SkillRuntimeSettings {
  allowed_source_hosts: string[]
  max_archive_depth: number
  max_file_bytes: string
  max_files: number
  max_materialized_bytes: string
  max_repository_bytes: string
  max_text_bytes: string
}

export const skillSecurityAdapter: SecurityAssessmentAdapter = {
  execute: async (context) => {
    if (context.assessment.subject_type !== 'skill' && context.assessment.subject_type !== 'skill_submission')
      throw new AiSecurityError('SECURITY_ADAPTER_NOT_READY', 'Skill 适配器收到不支持的主体类型')
    await context.checkpoint()
    const { settings, snapshot } = await loadAdapterInput(context.assessment.subject_type, context.assessment.subject_id)
    if (snapshot.declaredFingerprint !== context.assessment.declared_fingerprint)
      throw new AiSecurityError('SECURITY_ASSESSMENT_INPUT_CHANGED', 'Skill 内容在扫描准备阶段已经变化')
    const payload = skillPayload(snapshot.payload)
    const localDeterministic = isLocalDeterministicAssessment(context.assessment)
    const material = await acquireSkillMaterial(
      payload,
      snapshot.slug,
      settings,
      context.signal,
      localDeterministic,
      context.sourceCache,
    )
    const inputFingerprint = createInputFingerprint({
      declaredFingerprint: context.assessment.declared_fingerprint,
      files: material.files,
      sourceRevision: material.sourceRevision,
    })
    await context.checkpoint()

    const llm = shouldUseSecurityLlm(context.assessment.execution_profile)
      ? await getLlmRuntimeConfig()
      : null
    const builtIn = analyzeSkillFiles(material.files, Number(settings.max_text_bytes))
    let engineScore: null | number = null
    let findings = builtIn.findings
    let rawReportFileId: null | string = null
    let rulesVersion: string = SKILL_SECURITY_ADAPTER_VERSION.rules
    let scannerName = 'hillm-nav-skill-static'
    let scannerVersion = '1'
    let usedIsolatedScanner = false
    if (material.mode === 'repository' && llm && isolatedScannerConfigured(llm)) {
      try {
        const serialized = await scanSkillArchive({
          archive: material.archive,
          assessmentId: context.assessment.id,
          model: llm.model,
          signal: context.signal,
        })
        const normalized = parseAndNormalizeSkillSarif(serialized, material.paths)
        engineScore = normalized.engineScore
        findings = [...normalized.findings, ...builtIn.findings]
        rulesVersion = `${normalized.rulesVersion}+${SKILL_SECURITY_ADAPTER_VERSION.rules}`
        scannerName = normalized.scannerName
        scannerVersion = normalized.scannerVersion
        rawReportFileId = await storeRedactedReport(context.assessment.id, serialized)
        usedIsolatedScanner = true
      }
      catch (error) {
        if (context.signal.aborted)
          throw context.signal.reason
        if (!(error instanceof SecurityScannerClientError))
          throw error
      }
    }
    await context.checkpoint()
    const coverage = buildSkillCoverage(material, builtIn.inspectedPaths, usedIsolatedScanner)
    const evaluation = await evaluateTrustedContent({
      aiAssistance: localDeterministic || material.mode === 'platform' ? 'disabled' : 'preferred',
      content: {
        documentation: builtIn.excerpts,
        manifest: {
          fileCount: material.fileCount,
          files: material.files.map(file => ({
            path: file.path,
            sha256: file.sha256,
            size: file.bytes.byteLength,
          })),
          materialMode: material.mode,
          totalBytes: material.totalBytes,
        },
        metadata: snapshot.payload,
        scannerSummary: findings.map(finding => ({
          artifactPath: finding.artifactPath,
          riskCode: finding.riskCode,
          severity: finding.severity,
          title: finding.title,
        })),
        sourceRevision: material.sourceRevision,
      },
      coverage,
      documents: material.files.map(file => ({
        content: Buffer.from(file.bytes).toString('utf8'),
        path: file.path,
      })),
      findings,
      name: snapshot.name,
      signal: context.signal,
      subjectType: context.assessment.subject_type,
    })

    return {
      coverage,
      engineScore,
      evaluation,
      findings,
      inputFingerprint,
      rawReportFileId,
      rulesVersion,
      scannerName,
      scannerVersion,
      sourceRevision: material.sourceRevision,
      summary: findings.length === 0
        ? material.mode === 'platform'
          ? material.sourceUnavailable
            ? '当前依据为站内名称、说明和安装声明，未命中已知高风险模式；公开源码建议核对。'
            : '当前依据为站内已发布材料，未命中已知高风险模式；外部来源建议核对。'
          : usedIsolatedScanner
            ? '隔离深度评测未发现 SkillTrustBench 风险项。'
            : '当前优先材料未命中已知高风险模式；未执行的运行时行为建议核对。'
        : `${material.mode === 'platform' ? '站内材料' : usedIsolatedScanner ? '隔离评测材料' : '仓库优先材料'}发现 ${findings.length} ${findings.some(securityRiskRequiresAction) ? '项需处理的危险证据' : '条使用建议'}；建议核对具体权限与执行边界。`,
    }
  },
  publicSubjectType: 'skill',
  usesLlm: true,
  version: SKILL_SECURITY_ADAPTER_VERSION,
}

async function acquireSkillMaterial(
  payload: PlatformSkillPayload,
  subjectSlug: null | string,
  settings: SkillRuntimeSettings,
  signal?: AbortSignal,
  localDeterministic = false,
  sourceCache: import('../acquisition/source-cache').SecurityGitSourceCache | null = null,
): Promise<AcquiredSkillMaterial> {
  const parsed = payload.sourceKind === 'git_repository' && payload.sourceUrl
    ? supportedProviderUrl(payload.sourceUrl, settings.allowed_source_hosts)
    : null
  if (!parsed) {
    return platformSkillMaterial(payload, false)
  }

  try {
    const downloaded = sourceCache
      ? await sourceCache.acquire({
          maxArchiveBytes: Number(settings.max_repository_bytes),
          signal,
          sourceUrl: parsed.canonicalUrl,
        })
      : await resolveAndDownloadGitSource({
          maxArchiveBytes: Number(settings.max_repository_bytes),
          signal,
          sourceUrl: parsed.canonicalUrl,
          strategy: localDeterministic ? 'smart_http' : 'provider_rest',
        })
    const prepared = await prepareSkillSourceArchive({
      archive: downloaded.archive,
      limits: {
        maxArchiveBytes: Number(settings.max_repository_bytes),
        maxDepth: settings.max_archive_depth,
        maxFileBytes: Number(settings.max_file_bytes),
        maxFiles: settings.max_files,
        maxMaterializedBytes: Number(settings.max_materialized_bytes),
      },
      subdirectory: downloaded.providerUrl.subdirectory,
      subjectSlug,
    })
    const priority = selectPriorityRepositoryMaterial({
      files: prepared.manifest.files,
      subjectKind: 'skill',
      subjectSlug,
    })
    if (!priority.files.some(file => /(?:^|\/)SKILL\.md$/i.test(file.path)))
      throw new AiSecurityError('SECURITY_SOURCE_INVALID', 'Skill 源码中未定位到与当前内容匹配的 SKILL.md')
    return {
      archive: createStoredZip(priority.files.map(file => ({ bytes: file.bytes, path: file.path }))),
      fileCount: priority.files.length,
      files: priority.files,
      mode: 'repository',
      paths: new Set(priority.files.map(file => file.path)),
      sourceUnavailable: false,
      sourceRevision: downloaded.sourceRevision,
      totalBytes: priority.inspectedBytes,
      totalFileCount: prepared.manifest.fileCount,
      truncatedPaths: priority.truncatedPaths,
    }
  }
  catch (error) {
    if (!localDeterministic || !shouldUsePlatformFallbackForSourceError(error))
      throw error
    return platformSkillMaterial(payload, true)
  }
}

function buildSkillCoverage(
  material: AcquiredSkillMaterial,
  inspectedPaths: readonly string[],
  usedIsolatedScanner: boolean,
): SecurityCoverageInput {
  const includedCount = usedIsolatedScanner ? material.fileCount : inspectedPaths.length
  if (material.mode === 'platform') {
    return buildPlatformSkillCoverage({
      fileCount: material.fileCount,
      inspectedPaths,
      sourceUnavailable: material.sourceUnavailable,
    })
  }
  const skipped = [{
    reason: '为控制评测规模，本次只分析对应 SKILL.md、README、安装/安全说明和依赖清单，不执行仓库代码',
    ref: 'skill/priority-material-only',
  }]
  if (material.truncatedPaths.length > 0) {
    skipped.push({
      reason: `文档达到文本预算，仅分析前 ${material.totalBytes} 字节`,
      ref: 'skill/text-budget',
    })
  }
  return {
    included: usedIsolatedScanner ? material.files.map(file => file.path) : [...inspectedPaths],
    level: 'partial' as const,
    partitions: {
      source: {
        includedCount,
        skippedCount: Math.max(0, material.totalFileCount - includedCount),
        status: 'partial' as const,
      },
    },
    skipped,
    sourceRevision: material.sourceRevision,
  }
}

function isolatedScannerConfigured(llm: Awaited<ReturnType<typeof getLlmRuntimeConfig>>) {
  if (isSecurityWorkerLocalOnly())
    return false
  const model = process.env.AI_SECURITY_SCANNER_MODEL?.normalize('NFC').trim()
  return llm.protocol === 'openai'
    && Boolean(process.env.AI_SECURITY_SCANNER_URL?.trim())
    && Boolean(process.env.AI_SECURITY_SCANNER_SHARED_SECRET?.trim())
    && Boolean(model && model === llm.model)
}

async function loadAdapterInput(subjectType: SecuritySubjectType, subjectId: string) {
  const pool = await getBusinessPool()
  const client = await pool.connect()
  try {
    const [settings, snapshot] = await Promise.all([
      client.query<SkillRuntimeSettings>(`
        select allowed_source_hosts, max_archive_depth, max_file_bytes,
               max_files, max_materialized_bytes, max_repository_bytes,
               max_text_bytes
        from public.ds_ai_security_settings where id = true
      `),
      loadSecuritySubjectSnapshot(client, subjectType, subjectId),
    ])
    if (!settings.rows[0])
      throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', '安全评测设置不存在')
    return { settings: settings.rows[0], snapshot }
  }
  finally {
    client.release()
  }
}

function platformSkillMaterial(
  payload: PlatformSkillPayload,
  sourceUnavailable: boolean,
): AcquiredSkillMaterial {
  const file = buildPlatformSkillFile(payload)
  return {
    archive: createStoredZip([file]),
    fileCount: 1,
    files: [file],
    mode: 'platform',
    paths: new Set([file.path]),
    sourceRevision: null,
    sourceUnavailable,
    totalBytes: file.bytes.byteLength,
    totalFileCount: 1,
    truncatedPaths: [],
  }
}

function skillPayload(payload: unknown): PlatformSkillPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new AiSecurityError('SECURITY_REPORT_INVALID', 'Skill 评测材料格式无效')
  const value = payload as Record<string, unknown>
  if (typeof value.name !== 'string' || typeof value.summary !== 'string'
    || typeof value.description !== 'string'
    || !['git_repository', 'external_page', 'platform_content'].includes(String(value.sourceKind))
    || (value.sourceUrl !== null && typeof value.sourceUrl !== 'string')
    || !Array.isArray(value.platforms) || !value.platforms.every(platform => typeof platform === 'string')
    || (value.installCommand !== null && typeof value.installCommand !== 'string')
    || (value.version !== null && typeof value.version !== 'string')) {
    throw new AiSecurityError('SECURITY_REPORT_INVALID', 'Skill 评测材料字段不完整')
  }
  return {
    description: value.description,
    installCommand: value.installCommand,
    name: value.name,
    platforms: value.platforms,
    sourceKind: value.sourceKind as PlatformSkillPayload['sourceKind'],
    sourceUrl: value.sourceUrl,
    summary: value.summary,
    version: value.version,
  }
}

async function storeRedactedReport(assessmentId: string, serialized: string) {
  const body = Buffer.from(redactSecurityText(serialized), 'utf8')
  let stored: Awaited<ReturnType<typeof storeSmallFile>> | null = null
  try {
    stored = await storeSmallFile({
      body,
      extension: 'json',
      mimeType: 'application/sarif+json',
      originalName: `${assessmentId}.sarif.json`,
      ownerId: null,
      scope: 'ai-security-report',
      visibility: 'private',
    })
    await completeSmallFileUpload(stored.infrastructureUploadSessionId)
    return stored.id
  }
  catch (error) {
    if (stored)
      await deleteFileObject(stored.id).catch(() => undefined)
    throw error
  }
}

function supportedProviderUrl(sourceUrl: string, allowedHosts: readonly string[]) {
  let host: string
  try {
    host = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/, '')
  }
  catch {
    return null
  }
  if (!['github.com', 'gitlab.com'].includes(host)
    || !allowedHosts.map(value => value.toLowerCase()).includes(host)) {
    return null
  }
  try {
    return parseProviderUrl(sourceUrl)
  }
  catch (error) {
    if (error instanceof AiSecurityError && error.code === 'SECURITY_SOURCE_NOT_ALLOWED')
      return null
    throw error
  }
}

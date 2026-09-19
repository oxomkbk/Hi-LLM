import 'server-only'

import { getBusinessPool } from '@/lib/db/business'

import { inspectSourceArchive } from '../acquisition/archive'
import { isGitSourceConnectionError, resolveAndDownloadGitSource } from '../acquisition/git-provider'
import { isPriorityRepositoryMaterialPath, selectPriorityRepositoryMaterial } from '../acquisition/priority-material'
import { parseProviderUrl } from '../acquisition/provider-url'
import { shouldUsePlatformFallbackForSourceError } from '../acquisition/source-fallback'
import { sha256Canonical } from '../canonical-json'
import { AiSecurityError } from '../errors'
import { createInputFingerprint } from '../fingerprints'
import { loadSecuritySubjectSnapshot } from '../subject-repository'
import { evaluateTrustedContent } from '../trust-evaluation'
import { analyzeMcpPayload } from './mcp-analysis'
import { analyzeMcpSourceFiles } from './mcp-source-analysis'
import { isLocalDeterministicAssessment } from './types'

import type { McpPayload } from './mcp-analysis'
import type { SecurityAssessmentAdapter } from './types'

export const MCP_SECURITY_ADAPTER_VERSION = {
  adapter: 'mcp-priority-material-v3',
  normalizer: 'platform-finding-v1',
  rules: 'mcp-config+priority-source+document-evidence-v5-traceable-directives',
  scanner: 'hillm-nav-mcp-trust@2',
} as const

interface McpRuntimeSettings {
  allowed_source_hosts: string[]
  max_archive_depth: number
  max_file_bytes: string
  max_files: number
  max_materialized_bytes: string
  max_repository_bytes: string
}

export const mcpSecurityAdapter: SecurityAssessmentAdapter = {
  execute: async (context) => {
    await context.checkpoint()
    if (context.assessment.subject_type !== 'mcp' && context.assessment.subject_type !== 'mcp_submission')
      throw new TypeError('MCP adapter received an incompatible subject type')
    const pool = await getBusinessPool()
    const client = await pool.connect()
    try {
      const snapshot = await loadSecuritySubjectSnapshot(client, context.assessment.subject_type, context.assessment.subject_id)
      if (snapshot.declaredFingerprint !== context.assessment.declared_fingerprint)
        throw new AiSecurityError('SECURITY_ASSESSMENT_INPUT_CHANGED', 'MCP 内容在扫描准备阶段已经变化')
      const payload = mcpPayload(snapshot.payload)
      const settingsResult = await client.query<McpRuntimeSettings>(`
        select allowed_source_hosts, max_archive_depth, max_file_bytes,
               max_files, max_materialized_bytes, max_repository_bytes
        from public.ds_ai_security_settings where id = true
      `)
      const settings = settingsResult.rows[0]
      if (!settings)
        throw new AiSecurityError('SECURITY_SCHEMA_NOT_READY', '安全评测设置不存在')
      const source = await acquireMcpSource(
        payload.sourceUrl,
        settings,
        context.signal,
        isLocalDeterministicAssessment(context.assessment),
        context.sourceCache,
      )
      const sourceAnalysis = analyzeMcpSourceFiles(source.files)
      const findings = [...analyzeMcpPayload(payload), ...sourceAnalysis.findings]
      const included = [
        'mcp/manifest',
        ...payload.installations.map((_, index) => `mcp/installation/${index}`),
        ...source.files.map(file => `source:${file.path}`),
      ]
      const skipped = [{
        reason: '不会连接远程 MCP、执行安装命令或启动第三方进程',
        ref: 'mcp/runtime-dynamic-assessment',
      }]
      if (source.files.length > 0) {
        skipped.push({
          reason: '为控制评测规模，本次只分析 README、安装/安全说明和依赖清单，不执行其余仓库代码',
          ref: 'mcp/priority-material-only',
        })
      }
      else if (payload.sourceUrl) {
        skipped.push({
          reason: '当前依据为站内连接和安装配置；公开源码文档将在可达时自动补充',
          ref: 'mcp/source-reference-pending',
        })
      }
      const hasSourceMaterial = source.files.length > 0
      const coverage = {
        included,
        level: hasSourceMaterial ? 'partial' as const : 'config_only' as const,
        partitions: {
          configuration: {
            includedCount: payload.installations.length + 1,
            skippedCount: 0,
            status: 'config_only' as const,
          },
          runtime: { includedCount: 0, skippedCount: 1, status: 'not_applicable' as const },
          source: {
            includedCount: source.files.length,
            skippedCount: hasSourceMaterial
              ? Math.max(0, source.totalFileCount - source.files.length)
              : payload.sourceUrl ? 1 : 0,
            status: hasSourceMaterial ? 'partial' as const : payload.sourceUrl ? 'partial' as const : 'not_applicable' as const,
          },
        },
        skipped,
        sourceRevision: source.sourceRevision,
      }
      const configurationDocument = mcpConfigurationDocument(payload)
      const evaluation = await evaluateTrustedContent({
        aiAssistance: isLocalDeterministicAssessment(context.assessment) ? 'disabled' : 'preferred',
        content: snapshot.payload,
        coverage,
        documents: [configurationDocument, ...sourceAnalysis.documents],
        findings,
        name: snapshot.name,
        signal: context.signal,
        subjectType: context.assessment.subject_type,
      })
      await context.checkpoint()
      return {
        coverage,
        engineScore: null,
        evaluation,
        findings,
        inputFingerprint: createInputFingerprint({
          declaredFingerprint: snapshot.declaredFingerprint,
          files: [
            { path: 'mcp/configuration.json', sha256: sha256Canonical(payload) },
            ...source.files,
          ],
          sourceRevision: source.sourceRevision,
        }),
        rawReportFileId: null,
        rulesVersion: MCP_SECURITY_ADAPTER_VERSION.rules,
        scannerName: 'hillm-nav-mcp-static',
        scannerVersion: '1',
        sourceRevision: source.sourceRevision,
        summary: findings.length === 0
          ? hasSourceMaterial
            ? `已检查连接配置及 ${source.files.length} 份源码优先文档，当前材料未命中已知高风险规则；未连接第三方 MCP。`
            : '已检查站内连接和安装配置，当前材料未命中已知高风险规则；未连接第三方 MCP。'
          : `当前材料发现 ${findings.length} 项具体风险或使用建议；未连接或执行第三方 MCP。`,
      }
    }
    finally {
      client.release()
    }
  },
  publicSubjectType: 'mcp',
  usesLlm: true,
  version: MCP_SECURITY_ADAPTER_VERSION,
}

async function acquireMcpSource(
  sourceUrl: null | string,
  settings: McpRuntimeSettings,
  signal: AbortSignal,
  localDeterministic: boolean,
  sourceCache: import('../acquisition/source-cache').SecurityGitSourceCache | null,
) {
  const empty = { files: [] as import('../acquisition/manifest').AcquiredSourceFile[], sourceRevision: null, totalFileCount: 0 }
  const parsed = sourceUrl ? supportedProviderUrl(sourceUrl, settings.allowed_source_hosts) : null
  if (!parsed)
    return empty
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
    const manifest = await inspectSourceArchive({
      archive: downloaded.archive,
      includePath: path => isPriorityRepositoryMaterialPath(path, 'mcp'),
      limits: {
        maxArchiveBytes: Number(settings.max_repository_bytes),
        maxDepth: settings.max_archive_depth,
        maxFileBytes: Number(settings.max_file_bytes),
        maxFiles: settings.max_files,
        maxMaterializedBytes: Number(settings.max_materialized_bytes),
      },
      subdirectory: downloaded.providerUrl.subdirectory,
    })
    const priority = selectPriorityRepositoryMaterial({ files: manifest.files, subjectKind: 'mcp' })
    return {
      files: priority.files,
      sourceRevision: downloaded.sourceRevision,
      totalFileCount: manifest.fileCount,
    }
  }
  catch (error) {
    if (signal.aborted)
      throw signal.reason
    if (isGitSourceConnectionError(error) || shouldUsePlatformFallbackForSourceError(error))
      return empty
    throw error
  }
}

function mcpConfigurationDocument(payload: McpPayload) {
  const installations = payload.installations.map((installation, index) => [
    `### 连接 ${index + 1}`,
    `传输方式：${installation.transport}`,
    installation.command ? `命令：${[installation.command, ...installation.args].join(' ')}` : '',
    installation.packageName ? `依赖：${installation.packageName}${installation.version ? `@${installation.version}` : ''}` : '',
    installation.remoteUrl ? `远程地址：${installation.remoteUrl}` : '',
    installation.envVars.length > 0 ? `所需变量：${installation.envVars.map(item => item.name).join('、')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')
  return {
    content: [
      `# ${payload.name}`,
      `## 用途\n\n${payload.summary}`,
      `## 说明\n\n${payload.description}`,
      payload.capabilities.length > 0 ? `## 能力\n\n${payload.capabilities.join('、')}` : '',
      `## 协议版本\n\n${payload.protocolVersion}`,
      `## 安装与连接\n\n${installations}`,
    ].filter(Boolean).join('\n\n'),
    path: 'mcp/configuration.md',
  }
}

function mcpPayload(value: unknown): McpPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid MCP assessment payload')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.installations)
    || !Array.isArray(record.capabilities)
    || !record.capabilities.every(capability => typeof capability === 'string')
    || typeof record.description !== 'string'
    || typeof record.name !== 'string'
    || typeof record.protocolVersion !== 'string'
    || typeof record.summary !== 'string'
    || (record.sourceUrl !== null && typeof record.sourceUrl !== 'string')) {
    throw new TypeError('Invalid MCP assessment payload')
  }
  return value as McpPayload
}

function supportedProviderUrl(sourceUrl: string, allowedHosts: readonly string[]) {
  let parsed: ReturnType<typeof parseProviderUrl>
  try {
    parsed = parseProviderUrl(sourceUrl)
  }
  catch {
    return null
  }
  return allowedHosts.map(value => value.toLowerCase()).includes(parsed.host) ? parsed : null
}

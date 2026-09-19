import 'server-only'

import { getBusinessPool } from '@/lib/db/business'

import { inspectSourceArchive, prepareSkillSourceArchive } from './acquisition/archive'
import { downloadGitSourceArchive, resolveGitSourceRevision } from './acquisition/git-provider'
import { isPriorityRepositoryMaterialPath } from './acquisition/priority-material'
import { parseProviderUrl } from './acquisition/provider-url'
import { AiSecurityError } from './errors'
import { getSecuritySettings } from './settings-repository'
import { loadSecuritySubjectSnapshot } from './subject-repository'

import type { SourceArchiveLimits } from './acquisition/archive'
import type { ResolvedGitSource } from './acquisition/git-provider'
import type { ParsedProviderUrl } from './acquisition/provider-url'
import type {
  SecuritySourceCheckErrorCode,
  SecuritySourceCheckResult,
  SecuritySourceCheckSubjectType,
} from './source-check-contract'
import type { SecuritySubjectSnapshot } from './subject-repository'

export interface SecuritySourceCheckContext {
  allowedSourceHosts: readonly string[]
  limits: SourceArchiveLimits
  snapshot: SecuritySubjectSnapshot
}

export interface SecuritySourceCheckDependencies {
  downloadArchive: (input: {
    maxArchiveBytes?: number
    providerUrl: ParsedProviderUrl
    signal?: AbortSignal
    sourceRevision: string
  }) => Promise<Uint8Array>
  loadContext: (
    subjectType: SecuritySourceCheckSubjectType,
    subjectId: string,
  ) => Promise<SecuritySourceCheckContext>
  now: () => Date
  resolveRevision: (input: { signal?: AbortSignal, sourceUrl: string }) => Promise<ResolvedGitSource>
}

export class SecuritySourceCheckServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: SecuritySourceCheckErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SecuritySourceCheckServiceError'
  }
}

const defaultDependencies: SecuritySourceCheckDependencies = {
  downloadArchive: downloadGitSourceArchive,
  loadContext: loadSourceCheckContext,
  now: () => new Date(),
  resolveRevision: resolveGitSourceRevision,
}

export async function checkSecuritySubjectSource(
  input: {
    signal?: AbortSignal
    subjectId: string
    subjectType: SecuritySourceCheckSubjectType
  },
  dependencies: SecuritySourceCheckDependencies = defaultDependencies,
): Promise<SecuritySourceCheckResult> {
  const context = await loadContext(input, dependencies)
  const sourceUrl = subjectSourceUrl(context.snapshot, input.subjectType)
  const providerUrl = allowedProviderUrl(sourceUrl, context.allowedSourceHosts)

  const resolved = await resolveRevision(providerUrl, input.signal, dependencies)
  const archive = await downloadArchive(resolved, context.limits.maxArchiveBytes, input.signal, dependencies)
  const manifest = await inspectArchive(
    archive,
    resolved.providerUrl,
    context.limits,
    input.subjectType,
    context.snapshot.slug,
  )

  return {
    archiveBytes: archive.byteLength,
    canonicalUrl: resolved.providerUrl.canonicalUrl,
    checkedAt: dependencies.now().toISOString(),
    fileCount: manifest.fileCount,
    projectPath: resolved.providerUrl.projectPath,
    provider: resolved.providerUrl.provider,
    ref: resolved.providerUrl.ref,
    sourceRevision: resolved.sourceRevision,
    subdirectory: resolved.providerUrl.subdirectory,
    totalBytes: manifest.totalBytes,
  }
}

function allowedProviderUrl(sourceUrl: string, allowedSourceHosts: readonly string[]) {
  let parsed: ParsedProviderUrl
  try {
    parsed = parseProviderUrl(sourceUrl)
  }
  catch (error) {
    throw sourceError('只支持允许列表内的公开 GitHub/GitLab 仓库或 tree 子目录', 422, 'SOURCE_CHECK_URL_INVALID', error)
  }
  const allowed = new Set(allowedSourceHosts.map(value => value.normalize('NFC').trim().toLowerCase()))
  if (!allowed.has(parsed.host)) {
    throw sourceError('只支持允许列表内的公开 GitHub/GitLab 仓库或 tree 子目录', 422, 'SOURCE_CHECK_URL_INVALID')
  }
  return parsed
}

async function downloadArchive(
  resolved: ResolvedGitSource,
  maxArchiveBytes: number,
  signal: AbortSignal | undefined,
  dependencies: SecuritySourceCheckDependencies,
) {
  try {
    return await dependencies.downloadArchive({
      maxArchiveBytes,
      providerUrl: resolved.providerUrl,
      signal,
      sourceRevision: resolved.sourceRevision,
    })
  }
  catch (error) {
    if (isAiSecurityError(error, 'SOURCE_LIMIT_EXCEEDED'))
      throw sourceError('来源规模超过平台检查限制', 413, 'SOURCE_CHECK_LIMIT_EXCEEDED', error)
    if (isAiSecurityError(error, 'SECURITY_SOURCE_NOT_ALLOWED'))
      throw sourceError('来源平台连接不符合安全策略', 422, 'SOURCE_CHECK_URL_INVALID', error)
    throw sourceError('已找到提交，但源码归档下载失败，请稍后重试', 502, 'SOURCE_CHECK_DOWNLOAD_FAILED', error)
  }
}

async function inspectArchive(
  archive: Uint8Array,
  providerUrl: ParsedProviderUrl,
  limits: SourceArchiveLimits,
  subjectType: SecuritySourceCheckSubjectType,
  subjectSlug: null | string,
) {
  try {
    if (subjectType === 'skill' || subjectType === 'skill_submission') {
      return (await prepareSkillSourceArchive({
        archive,
        limits,
        subdirectory: providerUrl.subdirectory,
        subjectSlug,
      })).manifest
    }
    return await inspectSourceArchive({
      archive,
      includePath: path => isPriorityRepositoryMaterialPath(path, 'mcp'),
      limits,
      subdirectory: providerUrl.subdirectory,
    })
  }
  catch (error) {
    if (isAiSecurityError(error, 'SOURCE_LIMIT_EXCEEDED'))
      throw sourceError('来源规模超过平台检查限制', 413, 'SOURCE_CHECK_LIMIT_EXCEEDED', error)
    throw sourceError('来源目录或资源结构不符合要求', 422, 'SOURCE_CHECK_STRUCTURE_INVALID', error)
  }
}

function isAiSecurityError(error: unknown, code: AiSecurityError['code']) {
  return error instanceof AiSecurityError && error.code === code
}

async function loadContext(
  input: { subjectId: string, subjectType: SecuritySourceCheckSubjectType },
  dependencies: SecuritySourceCheckDependencies,
) {
  try {
    return await dependencies.loadContext(input.subjectType, input.subjectId)
  }
  catch (error) {
    if (isAiSecurityError(error, 'SECURITY_ASSESSMENT_NOT_FOUND'))
      throw sourceError('资源不存在或已删除', 404, 'SOURCE_CHECK_SUBJECT_NOT_FOUND', error)
    if (error instanceof SecuritySourceCheckServiceError)
      throw error
    throw sourceError('来源检查暂时不可用', 500, 'SOURCE_CHECK_FAILED', error)
  }
}

async function loadSourceCheckContext(
  subjectType: SecuritySourceCheckSubjectType,
  subjectId: string,
): Promise<SecuritySourceCheckContext> {
  const pool = await getBusinessPool()
  const client = await pool.connect()
  try {
    const [settings, snapshot] = await Promise.all([
      getSecuritySettings(),
      loadSecuritySubjectSnapshot(client, subjectType, subjectId),
    ])
    return {
      allowedSourceHosts: settings.allowedSourceHosts,
      limits: {
        maxArchiveBytes: settings.limits.maxRepositoryBytes,
        maxDepth: settings.limits.maxArchiveDepth,
        maxFileBytes: settings.limits.maxFileBytes,
        maxFiles: settings.limits.maxFiles,
        maxMaterializedBytes: settings.limits.maxMaterializedBytes,
      },
      snapshot,
    }
  }
  finally {
    client.release()
  }
}

async function resolveRevision(
  providerUrl: ParsedProviderUrl,
  signal: AbortSignal | undefined,
  dependencies: SecuritySourceCheckDependencies,
) {
  try {
    return await dependencies.resolveRevision({ signal, sourceUrl: providerUrl.canonicalUrl })
  }
  catch (error) {
    if (isAiSecurityError(error, 'SECURITY_SOURCE_NOT_ALLOWED'))
      throw sourceError('来源平台连接不符合安全策略', 422, 'SOURCE_CHECK_URL_INVALID', error)
    throw sourceError('仓库或指定分支/标签当前不可访问', 409, 'SOURCE_CHECK_REVISION_UNAVAILABLE', error)
  }
}

function sourceError(
  message: string,
  status: number,
  code: SecuritySourceCheckErrorCode,
  cause?: unknown,
) {
  return new SecuritySourceCheckServiceError(message, status, code, cause === undefined ? undefined : { cause })
}

function subjectSourceUrl(snapshot: SecuritySubjectSnapshot, subjectType: SecuritySourceCheckSubjectType) {
  if (!snapshot.payload || typeof snapshot.payload !== 'object' || Array.isArray(snapshot.payload))
    throw sourceError('当前资源没有可检查的 Git 来源', 422, 'SOURCE_CHECK_NOT_APPLICABLE')
  const payload = snapshot.payload as Record<string, unknown>
  if ((subjectType === 'skill' || subjectType === 'skill_submission') && payload.sourceKind !== 'git_repository')
    throw sourceError('当前 Skill 不是 Git 仓库来源', 422, 'SOURCE_CHECK_NOT_APPLICABLE')
  if (typeof payload.sourceUrl !== 'string' || !payload.sourceUrl.trim())
    throw sourceError('当前资源没有可检查的 Git 来源', 422, 'SOURCE_CHECK_NOT_APPLICABLE')
  return payload.sourceUrl
}

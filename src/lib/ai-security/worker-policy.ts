import { sha256Canonical } from './canonical-json'

import type { SecurityMode, SecurityPublicSubjectType } from './domain'

export interface SecurityAdapterVersion {
  adapter: string
  normalizer: string
  rules: string
  scanner: string
}

export interface SecurityWorkerAdapterDescriptor {
  checkReadiness?: () => Promise<void>
  publicSubjectType: SecurityPublicSubjectType
  usesLlm: boolean
  version: SecurityAdapterVersion
}

export interface WorkerConfigurationIssue {
  code: 'SECURITY_ADAPTER_NOT_READY' | 'SECURITY_ADAPTER_VERSION_CHANGED' | 'SECURITY_LLM_CONFIG_CHANGED' | 'SECURITY_SCHEMA_NOT_READY'
  message: string
  subjectType?: SecurityPublicSubjectType
}

export function availableWorkerSubjectTypes(
  modes: Record<SecurityPublicSubjectType, SecurityMode>,
  issues: readonly WorkerConfigurationIssue[],
) {
  const unavailable = new Set(issues.flatMap(issue => issue.subjectType ? [issue.subjectType] : []))
  return enabledSubjectTypes(modes).filter(subjectType => !unavailable.has(subjectType))
}

export function evaluateWorkerConfiguration(input: {
  adapters: readonly SecurityWorkerAdapterDescriptor[]
  confirmedLlmFingerprint: string | null
  modes: Record<SecurityPublicSubjectType, SecurityMode>
  requiredConfigFingerprints: Readonly<Record<string, string>>
  runtimeLlmFingerprint: string | null
  skipLlmChecks?: boolean
  versionSettings: Readonly<Record<string, unknown>>
}) {
  const issues: WorkerConfigurationIssue[] = []
  for (const subjectType of enabledSubjectTypes(input.modes)) {
    const adapter = input.adapters.find(candidate => candidate.publicSubjectType === subjectType)
    if (!adapter) {
      issues.push({
        code: 'SECURITY_ADAPTER_NOT_READY',
        message: `${subjectType} security adapter is not registered`,
        subjectType,
      })
    }
    else if (!sameConfiguration(adapter.version, input.versionSettings[subjectType])) {
      issues.push({
        code: 'SECURITY_ADAPTER_VERSION_CHANGED',
        message: `${subjectType} security adapter version is not confirmed`,
        subjectType,
      })
    }

    if (!/^[0-9a-f]{64}$/.test(input.requiredConfigFingerprints[subjectType] ?? '')) {
      issues.push({
        code: 'SECURITY_SCHEMA_NOT_READY',
        message: `${subjectType} scanner configuration is not confirmed`,
        subjectType,
      })
    }
    if (!input.skipLlmChecks && adapter?.usesLlm
      && (!input.confirmedLlmFingerprint
        || !input.runtimeLlmFingerprint
        || input.confirmedLlmFingerprint !== input.runtimeLlmFingerprint)) {
      issues.push({
        code: 'SECURITY_LLM_CONFIG_CHANGED',
        message: `${subjectType} LLM runtime identity differs from the confirmed identity`,
        subjectType,
      })
    }
  }
  return issues
}

export function hasFatalWorkerIssue(issues: readonly WorkerConfigurationIssue[]) {
  return issues.some(issue => !issue.subjectType)
}

function enabledSubjectTypes(modes: Record<SecurityPublicSubjectType, SecurityMode>) {
  return (Object.entries(modes) as Array<[SecurityPublicSubjectType, SecurityMode]>)
    .filter(([, mode]) => mode !== 'off')
    .map(([subjectType]) => subjectType)
}

function sameConfiguration(expected: SecurityAdapterVersion, actual: unknown) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual))
    return false
  return sha256Canonical(expected) === sha256Canonical(actual)
}

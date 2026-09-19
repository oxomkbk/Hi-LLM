import 'server-only'

import {
  getSiteAccessSettings,
  updateSiteAccessSettings,
} from '@/lib/access-settings/service'
import { securityCapabilitiesForAdmin } from '@/lib/ai-security/capabilities'
import { listAdminAssessments } from '@/lib/ai-security/service'
import { getSecurityServiceState, setSecurityServiceState } from '@/lib/ai-security/service-state'
import { getSecuritySettings, updateSecuritySettings } from '@/lib/ai-security/settings-repository'
import {
  getNavigationAiSecuritySettings,
  updateNavigationAiSecuritySettings,
} from '@/lib/navigation-ai/security-settings'

import { SITE_PROTECTION_KEYS } from './types'

import type { SiteProtectionKey, SiteSecurityCenterState } from './types'
import type { Actor } from '@/lib/repositories/catalog'

export class SiteSecurityCenterError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'SITE_SECURITY_CENTER_INVALID') {
    super(message)
  }
}

export async function getSiteSecurityCenterState(adminId: string): Promise<SiteSecurityCenterState> {
  const [access, security, assessments, navigationAiSecurity] = await Promise.all([
    getSiteAccessSettings({ fresh: true }),
    getSecuritySettings(),
    listAdminAssessments({ pageIndex: 0, pageSize: 12 }),
    getNavigationAiSecuritySettings(),
  ])

  const recentIssues = assessments.list
    .filter(item => item.status === 'failed' || item.report_state === 'blocked' || item.report_state === 'review_required')
    .slice(0, 5)
    .map(item => ({
      createdAt: String(item.created_at),
      href: `/admin/security/${item.id}`,
      id: String(item.id),
      name: String(item.subject_name_snapshot),
      status: item.status === 'failed'
        ? 'failed' as const
        : item.report_state === 'blocked'
          ? 'blocked' as const
          : 'review_required' as const,
      subjectType: String(item.subject_type),
    }))

  return {
    canManage: securityCapabilitiesForAdmin(adminId).canManageSettings,
    generatedAt: new Date().toISOString(),
    metrics: {
      active: assessments.summary.active,
      blocked: assessments.summary.blocked,
      failed: assessments.summary.failed,
      passed: assessments.summary.passed,
      reviewRequired: assessments.summary.reviewRequired,
    },
    protections: {
      automaticScanning: assessments.runtime.serviceEnabled,
      aiSearchAbuseProtection: navigationAiSecurity.abuseProtectionEnabled,
      dangerousContentBlocking: [security.skillMode, security.mcpMode, security.promptMode]
        .every(mode => mode === 'enforce'),
      publisherVerification: [
        access.websiteSubmissionMode,
        access.skillSubmissionMode,
        access.mcpSubmissionMode,
        access.wonderlandComposerMode,
      ].every(mode => mode === 'authenticated'),
      publicSecurityStatus: [
        security.publicShowGrade,
        security.publicShowRiskCounts,
        security.publicShowScore,
        security.publicShowSummary,
      ].every(Boolean),
    },
    recentIssues,
    runtime: {
      lastSeenAt: assessments.runtime.lastSeenAt,
      queueSize: assessments.runtime.queue.queued + assessments.runtime.queue.inFlight,
      status: assessments.runtime.status,
      workerCount: assessments.runtime.workerCount,
    },
  }
}

export async function updateSiteProtection(input: {
  actor: Actor
  enabled: unknown
  key: unknown
}) {
  if (typeof input.enabled !== 'boolean')
    throw new SiteSecurityCenterError('安全防护开关格式无效')
  if (!SITE_PROTECTION_KEYS.includes(input.key as SiteProtectionKey))
    throw new SiteSecurityCenterError('未知的安全防护项目')

  const key = input.key as SiteProtectionKey
  if (key === 'automaticScanning') {
    const current = await getSecurityServiceState()
    await setSecurityServiceState({
      enabled: input.enabled,
      expectedVersion: current.version,
    }, input.actor)
  }
  else if (key === 'aiSearchAbuseProtection') {
    await updateNavigationAiSecuritySettings(input.enabled, input.actor)
  }
  else if (key === 'dangerousContentBlocking') {
    const mode = input.enabled ? 'enforce' : 'warn'
    await updateSecuritySettings({ mcpMode: mode, promptMode: mode, skillMode: mode }, input.actor)
  }
  else if (key === 'publisherVerification') {
    const current = await getSiteAccessSettings({ fresh: true })
    await updateSiteAccessSettings({
      contentDetailOpenMode: current.contentDetailOpenMode,
      emailAccessMode: current.emailAccessMode,
      emailAllowlist: current.emailAllowlist,
      expectedVersion: current.configVersion,
      mcpSubmissionMode: input.enabled ? 'authenticated' : 'anonymous',
      mcpSubmissionEnabled: current.mcpSubmissionEnabled,
      mcpSubmissionVisible: current.mcpSubmissionVisible,
      promptSubmissionEnabled: current.promptSubmissionEnabled,
      promptSubmissionVisible: current.promptSubmissionVisible,
      registrationEnabled: current.registrationEnabled,
      skillSubmissionMode: input.enabled ? 'authenticated' : 'anonymous',
      skillSubmissionEnabled: current.skillSubmissionEnabled,
      skillSubmissionVisible: current.skillSubmissionVisible,
      translationDefaultLanguage: current.translationDefaultLanguage,
      translationEnabled: current.translationEnabled,
      translationLanguages: current.translationLanguages,
      websiteSubmissionMode: input.enabled ? 'authenticated' : 'anonymous',
      websiteSubmissionEnabled: current.websiteSubmissionEnabled,
      websiteSubmissionVisible: current.websiteSubmissionVisible,
      wonderlandSubmissionEnabled: current.wonderlandSubmissionEnabled,
      wonderlandSubmissionVisible: current.wonderlandSubmissionVisible,
      wonderlandComposerMode: input.enabled ? 'authenticated' : 'guest_preview',
      workSubmissionEnabled: current.workSubmissionEnabled,
      workSubmissionVisible: current.workSubmissionVisible,
    }, input.actor.id)
  }
  else if (key === 'publicSecurityStatus') {
    await updateSecuritySettings({
      publicShowGrade: input.enabled,
      publicShowRiskCounts: input.enabled,
      publicShowScore: input.enabled,
      publicShowSummary: input.enabled,
    }, input.actor)
  }

  return getSiteSecurityCenterState(input.actor.id)
}

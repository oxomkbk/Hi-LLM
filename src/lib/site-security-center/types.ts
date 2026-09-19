export const SITE_PROTECTION_KEYS = [
  'automaticScanning',
  'aiSearchAbuseProtection',
  'dangerousContentBlocking',
  'publisherVerification',
  'publicSecurityStatus',
] as const

export type SiteProtectionKey = typeof SITE_PROTECTION_KEYS[number]

export interface SiteSecurityCenterState {
  canManage: boolean
  generatedAt: string
  metrics: {
    active: number
    blocked: number
    failed: number
    passed: number
    reviewRequired: number
  }
  protections: Record<SiteProtectionKey, boolean>
  recentIssues: Array<{
    createdAt: string
    href: string
    id: string
    name: string
    status: 'blocked' | 'failed' | 'review_required'
    subjectType: string
  }>
  runtime: {
    lastSeenAt: string | null
    queueSize: number
    status: string
    workerCount: number
  }
}

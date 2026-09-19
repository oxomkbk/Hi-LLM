import { SKILL_CATEGORIES, SKILL_PLATFORMS } from '@/lib/skill-constants'

import type { SkillStatus, SkillSubmissionStatus } from '@/types'

export const CATEGORY_OPTIONS = SKILL_CATEGORIES.map(value => ({ label: value, value }))
export const PLATFORM_OPTIONS = SKILL_PLATFORMS.map(value => ({ label: value, value }))

export const SKILL_STATUS_OPTIONS: { label: string, value: SkillStatus }[] = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已归档', value: 'archived' },
]

export const SUBMISSION_STATUS_OPTIONS: { label: string, value: SkillSubmissionStatus }[] = [
  { label: '待审核', value: 'pending' },
  { label: '安全评测中', value: 'pending_security' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

export const SKILL_STATUS_META = {
  draft: { color: 'warning', label: '草稿' },
  published: { color: 'success', label: '已发布' },
  archived: { color: 'default', label: '已归档' },
} as const satisfies Record<SkillStatus, { color: 'default' | 'success' | 'warning', label: string }>

export const SUBMISSION_STATUS_META = {
  pending: { color: 'warning', label: '待审核' },
  pending_security: { color: 'warning', label: '安全评测中' },
  approved: { color: 'success', label: '已通过' },
  rejected: { color: 'danger', label: '已拒绝' },
} as const satisfies Record<SkillSubmissionStatus, { color: 'danger' | 'success' | 'warning', label: string }>

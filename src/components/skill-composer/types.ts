import type { Skill, SkillSourceKind, SkillStatus, SkillSubmission } from '@/types'

export type SkillComposerMode = 'admin-create' | 'admin-edit' | 'submission' | 'submission-review'

export interface SkillComposerValue {
  author_name: string
  author_url: string
  category: string
  description: string
  featured: boolean
  homepage_url: string
  icon: string
  install_command: string
  license: string
  name: string
  platforms: string[]
  slug: string
  sort: number
  source_kind: SkillSourceKind
  source_url: string
  status: SkillStatus
  submitter_email: string
  submitter_name: string
  summary: string
  tags: string[]
  verified: boolean
  version: string
}

export type SkillSubmitIntent = 'approve' | 'reject' | 'save' | 'submit'

export function createEmptySkillComposerValue(): SkillComposerValue {
  return {
    author_name: '',
    author_url: '',
    category: '',
    description: '',
    featured: false,
    homepage_url: '',
    icon: '',
    install_command: '',
    license: '',
    name: '',
    platforms: [],
    slug: '',
    sort: 1,
    source_kind: 'git_repository',
    source_url: '',
    status: 'draft',
    submitter_email: '',
    submitter_name: '',
    summary: '',
    tags: [],
    verified: false,
    version: '',
  }
}

export function skillComposerPayload(value: SkillComposerValue) {
  return {
    author_name: value.author_name.trim(),
    author_url: optional(value.author_url),
    category: value.category,
    description: value.description.trim(),
    featured: value.featured,
    homepage_url: optional(value.homepage_url),
    icon: optional(value.icon),
    install_command: optional(value.install_command),
    license: optional(value.license),
    name: value.name.trim(),
    platforms: value.platforms,
    slug: value.slug.trim(),
    sort: value.sort,
    source_kind: value.source_kind,
    source_url: value.source_kind === 'platform_content' ? null : optional(value.source_url),
    status: value.status,
    submitter_email: optional(value.submitter_email),
    submitter_name: value.submitter_name.trim(),
    summary: value.summary.trim(),
    tags: value.tags,
    verified: value.verified,
    version: optional(value.version),
  }
}

export function skillToComposerValue(input: Skill | SkillSubmission): SkillComposerValue {
  const published = isPublishedSkill(input) ? input : null
  const submission = published ? null : input as SkillSubmission
  return {
    author_name: input.author_name,
    author_url: input.author_url ?? '',
    category: input.category,
    description: input.description,
    featured: published?.featured ?? false,
    homepage_url: input.homepage_url ?? '',
    icon: input.icon ?? '',
    install_command: input.install_command ?? '',
    license: input.license ?? '',
    name: input.name,
    platforms: input.platforms,
    slug: input.slug,
    sort: published?.sort ?? 1,
    source_kind: input.source_kind,
    source_url: input.source_url ?? '',
    status: published?.status ?? 'draft',
    submitter_email: submission?.submitter_email ?? '',
    submitter_name: submission?.submitter_name ?? '',
    summary: input.summary,
    tags: input.tags,
    verified: published?.verified ?? false,
    version: input.version ?? '',
  }
}

function isPublishedSkill(input: Skill | SkillSubmission): input is Skill {
  return typeof input.featured === 'boolean' && typeof input.sort === 'number'
}

function optional(value: string) {
  const normalized = value.trim()
  return normalized || null
}
